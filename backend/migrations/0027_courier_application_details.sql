ALTER TABLE courier_applications ADD COLUMN contact_phone TEXT;
ALTER TABLE courier_applications ADD COLUMN transport TEXT CHECK(transport IN ('motorcycle','car','bicycle','walking','other'));
ALTER TABLE courier_applications ADD COLUMN service_zone TEXT;
