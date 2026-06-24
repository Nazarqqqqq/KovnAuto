import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import mysql from "mysql2/promise";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(ROOT, "media", "uploads");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "autoprime-local-development-secret-change-me";
const DB_NAME = process.env.DB_NAME || "autoprime";

if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) throw new Error("DB_NAME may contain only letters, numbers and underscores");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: DB_NAME,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
});

await db.query(fs.readFileSync(path.join(ROOT, "database", "mysql-schema.sql"), "utf8"));

const seedCars = [
  ["BMW", "320i M Sport", 2.0, 2021, 52000, 32900, "Київ", 0, "/media/carsmedia/BMW.jpg", "Динамічний бізнес-седан у доглянутому стані. Автомобіль готовий до перевірки та тест-драйву."],
  ["Audi", "A6 Quattro", 2.0, 2021, 58000, 44800, "Львів", 0, "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1100&q=82", "Повнопривідний седан із комфортним салоном та прозорою історією обслуговування."],
  ["Mercedes-Benz", "C 200 AMG Line", 1.5, 2022, 34000, 47900, "Одеса", 1, "/media/carsmedia/Mercedes.jpg", "Mercedes-Benz C-Class у комплектації AMG Line. Яскравий дизайн, сучасний салон і економічний бензиновий двигун."],
  ["Tesla", "Model 3 Long Range", null, 2020, 65000, 32900, "Дніпро", 0, "/media/carsmedia/Tesla.jpg", "Електричний седан із великим запасом ходу, швидкою зарядкою та мінімальними витратами на обслуговування."],
  ["Porsche", "911 Carrera", 3.0, 2021, 19000, 119000, "Київ", 1, "/media/carsmedia/Porsche.jpg", "Спортивне купе Porsche 911 Carrera з малим пробігом. Преміальний стан та повна сервісна історія."],
  ["Toyota", "Camry Hybrid", 2.5, 2019, 87000, 24500, "Харків", 0, "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1100&q=82", "Надійний гібридний седан для міста та далеких подорожей."],
  ["Volkswagen", "Touareg R-Line", 3.0, 2022, 39000, 57900, "Івано-Франківськ", 0, "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1100&q=82", "Просторий повнопривідний SUV у комплектації R-Line."],
  ["Range Rover", "Sport P400", 3.0, 2023, 18000, 104000, "Київ", 1, "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1100&q=82", "Преміальний позашляховик із потужним двигуном та максимальним рівнем комфорту."],
  ["Skoda", "Octavia", 1.5, 2021, 54000, 24900, "Львів", 0, "/media/carsmedia/Skoda.jpg", "Практичний та економічний автомобіль із просторим салоном і великим багажником."]
];

const [[carCount]] = await db.query("SELECT COUNT(*) AS count FROM cars");
if (process.env.SEED_DEMO_DATA === "true" && Number(carCount.count) === 0) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const [brand, model, engineVolume, year, mileage, price, city, _legacyFlag, image, description] of seedCars) {
      const [result] = await connection.execute(
        "INSERT INTO cars (brand, model, engine_volume, year, mileage, price, city, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [brand, model, engineVolume, year, mileage, price, city, description]
      );
      await connection.execute("INSERT INTO car_photos (car_id, url) VALUES (?, ?)", [result.insertId, image]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/media", express.static(path.join(ROOT, "media"), { dotfiles: "deny" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype))
});

function publicUser(user) {
  return { id: Number(user.id), name: user.name, email: user.email };
}

function issueSession(response, user) {
  const token = jwt.sign({ sub: String(user.id) }, JWT_SECRET, { expiresIn: "7d" });
  response.cookie("autoprime_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function readUser(request) {
  const token = request.cookies.autoprime_session;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.execute("SELECT id, name, email FROM users WHERE id = ?", [Number(payload.sub)]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAuth(request, response, next) {
  const user = await readUser(request);
  if (!user) return response.status(401).json({ error: "Потрібна авторизація" });
  request.user = user;
  next();
}

function carSelect(where = "", order = "c.created_at DESC") {
  return `
    SELECT c.id, c.user_id AS ownerId, c.brand, c.model, c.engine_volume AS engineVolume,
      c.year, c.mileage, c.price, c.city, c.description, c.view_count AS views, c.status, c.created_at AS createdAt,
      COALESCE(u.name, 'KovAuto') AS sellerName,
      COALESCE((SELECT url FROM car_photos WHERE car_id = c.id ORDER BY sort_order, id LIMIT 1), '') AS image
    FROM cars c
    LEFT JOIN users u ON u.id = c.user_id
    ${where}
    ORDER BY CASE WHEN c.status = 'active' THEN 0 ELSE 1 END, ${order}
  `;
}

function validateCar(body) {
  const car = {
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    engineVolume: body.engineVolume === "" || body.engineVolume == null ? null : Number(body.engineVolume),
    year: Number(body.year),
    mileage: Number(body.mileage),
    price: Number(body.price),
    city: String(body.city || "").trim(),
    description: String(body.description || "").trim().slice(0, 5000),
    image: String(body.image || "").trim()
  };
  const maxYear = new Date().getFullYear() + 1;
  if (!car.brand || !car.model || !car.city) return { error: "Заповніть марку, модель і місто" };
  if (!Number.isInteger(car.year) || car.year < 1950 || car.year > maxYear) return { error: "Перевірте рік автомобіля" };
  if (!Number.isFinite(car.mileage) || car.mileage < 0 || !Number.isFinite(car.price) || car.price < 1) return { error: "Перевірте ціну та пробіг" };
  if (car.engineVolume !== null && (!Number.isFinite(car.engineVolume) || car.engineVolume <= 0 || car.engineVolume > 9.9)) return { error: "Перевірте об'єм двигуна" };
  return { car };
}

app.post("/api/auth/register", async (request, response) => {
  const name = String(request.body.name || "").trim();
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  if (name.length < 2) return response.status(400).json({ error: "Вкажіть ім'я" });
  if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(400).json({ error: "Вкажіть коректний email" });
  if (password.length < 8) return response.status(400).json({ error: "Пароль має містити щонайменше 8 символів" });
  const [existing] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length) return response.status(409).json({ error: "Цей email вже зареєстрований" });

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await db.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, passwordHash]);
  const user = { id: Number(result.insertId), name, email };
  issueSession(response, user);
  response.status(201).json({ user });
});

app.post("/api/auth/login", async (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error: "Невірний email або пароль" });
  issueSession(response, user);
  response.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie("autoprime_session");
  response.status(204).end();
});

app.get("/api/auth/me", async (request, response) => {
  const user = await readUser(request);
  response.json({ user: user ? publicUser(user) : null });
});

app.get("/api/cars", async (request, response) => {
  const conditions = ["c.status IN ('active', 'sold')"];
  const values = [];
  const add = (condition, value) => { conditions.push(condition); values.push(value); };
  if (request.query.brand) add("c.brand = ?", String(request.query.brand));
  if (request.query.model) add("LOWER(CONCAT(c.brand, ' ', c.model)) LIKE ?", `%${String(request.query.model).toLowerCase()}%`);
  if (request.query.city) add("LOWER(c.city) LIKE ?", `%${String(request.query.city).trim().toLowerCase()}%`);
  if (request.query.year) add("c.year >= ?", Number(request.query.year));
  if (request.query.price) add("c.price <= ?", Number(request.query.price));
  if (request.query.mileage) add("c.mileage <= ?", Number(request.query.mileage));
  const orders = {
    recommended: "c.created_at DESC",
    priceAsc: "c.price ASC",
    priceDesc: "c.price DESC",
    yearDesc: "c.year DESC",
    mileageAsc: "c.mileage ASC"
  };
  const order = orders[request.query.sort] || orders.recommended;
  const [cars] = await db.execute(carSelect(`WHERE ${conditions.join(" AND ")}`, order), values);
  response.json({ cars });
});

app.get("/api/cars/mine", requireAuth, async (request, response) => {
  const [cars] = await db.execute(carSelect("WHERE c.user_id = ?"), [request.user.id]);
  response.json({ cars });
});

app.get("/api/cars/:id", async (request, response) => {
  const id = Number(request.params.id);
  const [result] = await db.execute(
    "UPDATE cars SET view_count = view_count + 1 WHERE id = ? AND status IN ('active', 'sold')",
    [id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: "Автомобіль не знайдено" });
  const [cars] = await db.execute(carSelect("WHERE c.id = ?"), [id]);
  response.json({ car: cars[0] });
});

app.post("/api/cars", requireAuth, async (request, response) => {
  const { car, error } = validateCar(request.body);
  if (error) return response.status(400).json({ error });
  const [result] = await db.execute(
    "INSERT INTO cars (user_id, brand, model, engine_volume, year, mileage, price, city, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [request.user.id, car.brand, car.model, car.engineVolume, car.year, car.mileage, car.price, car.city, car.description]
  );
  if (car.image) await db.execute("INSERT INTO car_photos (car_id, url) VALUES (?, ?)", [result.insertId, car.image]);
  const [cars] = await db.execute(carSelect("WHERE c.id = ?"), [result.insertId]);
  response.status(201).json({ car: cars[0] });
});

app.patch("/api/cars/:id", requireAuth, async (request, response) => {
  const id = Number(request.params.id);
  const [existing] = await db.execute("SELECT id FROM cars WHERE id = ? AND user_id = ?", [id, request.user.id]);
  if (!existing.length) return response.status(404).json({ error: "Оголошення не знайдено" });
  const { car, error } = validateCar(request.body);
  if (error) return response.status(400).json({ error });
  await db.execute(
    "UPDATE cars SET brand = ?, model = ?, engine_volume = ?, year = ?, mileage = ?, price = ?, city = ?, description = ? WHERE id = ?",
    [car.brand, car.model, car.engineVolume, car.year, car.mileage, car.price, car.city, car.description, id]
  );
  if (car.image) {
    await db.execute("DELETE FROM car_photos WHERE car_id = ?", [id]);
    await db.execute("INSERT INTO car_photos (car_id, url) VALUES (?, ?)", [id, car.image]);
  }
  const [cars] = await db.execute(carSelect("WHERE c.id = ?"), [id]);
  response.json({ car: cars[0] });
});

app.patch("/api/cars/:id/status", requireAuth, async (request, response) => {
  const id = Number(request.params.id);
  const status = String(request.body.status || "");
  if (!Number.isInteger(id) || !["active", "sold"].includes(status)) {
    return response.status(400).json({ error: "Некоректний статус оголошення" });
  }
  const [result] = await db.execute(
    "UPDATE cars SET status = ? WHERE id = ? AND user_id = ?",
    [status, id, request.user.id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: "Оголошення не знайдено" });
  const [cars] = await db.execute(carSelect("WHERE c.id = ?"), [id]);
  response.json({ car: cars[0] });
});

app.delete("/api/cars/:id", requireAuth, async (request, response) => {
  const [result] = await db.execute("DELETE FROM cars WHERE id = ? AND user_id = ?", [Number(request.params.id), request.user.id]);
  if (!result.affectedRows) return response.status(404).json({ error: "Оголошення не знайдено" });
  response.status(204).end();
});

app.post("/api/uploads", requireAuth, upload.single("photo"), (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Оберіть JPG, PNG, WebP або AVIF" });
  response.status(201).json({ url: `/media/uploads/${request.file.filename}` });
});

app.get("/api/favorites", requireAuth, async (request, response) => {
  const [rows] = await db.execute("SELECT car_id AS id FROM favorites WHERE user_id = ?", [request.user.id]);
  response.json({ ids: rows.map((row) => Number(row.id)) });
});

app.put("/api/favorites/:carId", requireAuth, async (request, response) => {
  const carId = Number(request.params.carId);
  const [cars] = await db.execute("SELECT id FROM cars WHERE id = ? AND status = 'active'", [carId]);
  if (!cars.length) return response.status(404).json({ error: "Автомобіль не знайдено" });
  await db.execute("INSERT IGNORE INTO favorites (user_id, car_id) VALUES (?, ?)", [request.user.id, carId]);
  response.status(204).end();
});

app.delete("/api/favorites/:carId", requireAuth, async (request, response) => {
  await db.execute("DELETE FROM favorites WHERE user_id = ? AND car_id = ?", [request.user.id, Number(request.params.carId)]);
  response.status(204).end();
});

app.get("/api/messages", requireAuth, async (request, response) => {
  const [messages] = await db.execute(
    `SELECT m.id, m.car_id AS carId, m.sender_id AS senderId, m.recipient_id AS recipientId,
      m.body, m.read_at AS readAt, m.created_at AS createdAt,
      sender.name AS senderName, recipient.name AS recipientName,
      c.brand, c.model, c.user_id AS ownerId,
      COALESCE((SELECT cp.url FROM car_photos cp WHERE cp.car_id = c.id ORDER BY cp.id LIMIT 1), '') AS image
    FROM messages m
    JOIN cars c ON c.id = m.car_id
    JOIN users sender ON sender.id = m.sender_id
    JOIN users recipient ON recipient.id = m.recipient_id
    WHERE m.sender_id = ? OR m.recipient_id = ?
    ORDER BY m.created_at ASC, m.id ASC`,
    [request.user.id, request.user.id]
  );
  response.json({ messages });
});

app.post("/api/messages", requireAuth, async (request, response) => {
  const carId = Number(request.body.carId);
  const requestedRecipientId = Number(request.body.recipientId);
  const body = String(request.body.body || "").trim();
  const [cars] = await db.execute("SELECT user_id FROM cars WHERE id = ? AND status IN ('active', 'sold')", [carId]);
  const car = cars[0];
  if (!car?.user_id) return response.status(404).json({ error: "Автомобіль не знайдено" });
  if (!body || body.length > 2000) return response.status(400).json({ error: "Перевірте текст повідомлення" });

  const ownerId = Number(car.user_id);
  let recipientId = ownerId;
  if (Number(request.user.id) === ownerId) {
    if (!Number.isInteger(requestedRecipientId) || requestedRecipientId === ownerId) {
      return response.status(400).json({ error: "Оберіть учасника діалогу" });
    }
    const [conversation] = await db.execute(
      `SELECT id FROM messages
       WHERE car_id = ? AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
       LIMIT 1`,
      [carId, ownerId, requestedRecipientId, requestedRecipientId, ownerId]
    );
    if (!conversation.length) return response.status(403).json({ error: "Цей діалог ще не розпочато покупцем" });
    recipientId = requestedRecipientId;
  }
  if (recipientId === Number(request.user.id)) return response.status(400).json({ error: "Неможливо надіслати повідомлення собі" });

  const [result] = await db.execute(
    "INSERT INTO messages (car_id, sender_id, recipient_id, body) VALUES (?, ?, ?, ?)",
    [carId, request.user.id, recipientId, body]
  );
  response.status(201).json({ id: Number(result.insertId) });
});

app.patch("/api/messages/read", requireAuth, async (request, response) => {
  const carId = Number(request.body.carId);
  const otherUserId = Number(request.body.otherUserId);
  if (!Number.isInteger(carId) || !Number.isInteger(otherUserId)) {
    return response.status(400).json({ error: "Некоректний діалог" });
  }
  await db.execute(
    `UPDATE messages SET read_at = CURRENT_TIMESTAMP
     WHERE car_id = ? AND sender_id = ? AND recipient_id = ? AND read_at IS NULL`,
    [carId, otherUserId, request.user.id]
  );
  response.status(204).end();
});

const pages = ["index.html", "catalog.html", "car.html"];
for (const page of pages) app.get(page === "index.html" ? ["/", "/index.html"] : `/${page}`, (_request, response) => response.sendFile(path.join(ROOT, page)));
for (const asset of ["styles.css", "app.js"]) app.get(`/${asset}`, (_request, response) => response.sendFile(path.join(ROOT, asset)));

app.use((error, _request, response, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Фото має бути до 8 МБ" : "Не вдалося завантажити фото" });
  if (error?.code === "ECONNREFUSED") return response.status(503).json({ error: "MySQL недоступний. Запустіть MySQL у XAMPP" });
  response.status(500).json({ error: "Внутрішня помилка сервера" });
});

app.listen(PORT, () => console.log(`KovAuto MySQL: http://localhost:${PORT}`));
