CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cars (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(160) NOT NULL,
  engine_volume DECIMAL(3,1) NULL,
  year SMALLINT UNSIGNED NOT NULL,
  mileage INT UNSIGNED NOT NULL,
  price INT UNSIGNED NOT NULL,
  city VARCHAR(120) NOT NULL,
  description TEXT NULL,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'sold', 'draft') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY cars_search_idx (brand, year, price, mileage),
  KEY cars_user_idx (user_id),
  KEY cars_status_created_idx (status, created_at),
  CONSTRAINT cars_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE cars ADD COLUMN IF NOT EXISTS engine_volume DECIMAL(3,1) NULL AFTER model;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER city;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER description;

CREATE TABLE IF NOT EXISTS car_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  car_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(2048) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY car_photos_car_idx (car_id, sort_order),
  CONSTRAINT car_photos_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT UNSIGNED NOT NULL,
  car_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, car_id),
  KEY favorites_car_idx (car_id),
  CONSTRAINT favorites_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT favorites_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  car_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY messages_users_idx (sender_id, recipient_id),
  KEY messages_recipient_idx (recipient_id, created_at),
  KEY messages_car_idx (car_id),
  CONSTRAINT messages_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE,
  CONSTRAINT messages_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT messages_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
