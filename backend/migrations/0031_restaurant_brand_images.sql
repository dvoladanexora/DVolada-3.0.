CREATE TABLE restaurant_brand_images (
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 kind TEXT NOT NULL CHECK(kind IN ('logo','cover')),
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 image_base64 TEXT NOT NULL CHECK(length(image_base64) BETWEEN 1 AND 163840),
 PRIMARY KEY(restaurant_id,kind)
);
