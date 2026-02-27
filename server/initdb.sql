-- Initialize VacationSync database schema
-- This file creates all the core tables needed for the application

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT,
  password_hash TEXT,
  profile_image_url TEXT,
  cash_app_username TEXT,
  cash_app_username_legacy TEXT,
  cash_app_phone TEXT,
  cash_app_phone_legacy TEXT,
  venmo_username TEXT,
  venmo_phone TEXT,
  timezone TEXT,
  default_location TEXT,
  default_location_code TEXT,
  default_city TEXT,
  default_country TEXT,
  auth_provider TEXT,
  notification_preferences JSONB,
  has_seen_home_onboarding BOOLEAN DEFAULT FALSE,
  has_seen_trip_onboarding BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip calendars table
CREATE TABLE IF NOT EXISTS trip_calendars (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  share_code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  geoname_id INTEGER,
  city_name TEXT,
  country_name TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  population INTEGER,
  cover_image_url TEXT,
  cover_photo_url TEXT,
  cover_photo_card_url TEXT,
  cover_photo_thumb_url TEXT,
  cover_photo_alt TEXT,
  cover_photo_attribution TEXT,
  cover_photo_storage_key TEXT,
  cover_photo_original_url TEXT,
  cover_photo_focal_x DECIMAL,
  cover_photo_focal_y DECIMAL,
  cover_photo_upload_size INTEGER,
  cover_photo_upload_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_trip_calendars_share_code ON trip_calendars(share_code);
CREATE INDEX IF NOT EXISTS idx_trip_calendars_created_by ON trip_calendars(created_by);

-- Trip members table
CREATE TABLE IF NOT EXISTS trip_members (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id);

-- Activities table  
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'SCHEDULED',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  data JSONB,
  visibility TEXT DEFAULT 'public',
  voting_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_trip ON activities(trip_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time);

-- Activity acceptances table
CREATE TABLE IF NOT EXISTS activity_acceptances (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_acceptances_activity ON activity_acceptances(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_acceptances_user ON activity_acceptances(user_id);

-- Activity comments table
CREATE TABLE IF NOT EXISTS activity_comments (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_comments_activity ON activity_comments(activity_id);

-- Packing items table
CREATE TABLE IF NOT EXISTS packing_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_packed BOOLEAN DEFAULT FALSE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packing_items_trip ON packing_items(trip_id);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  paid_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  source_amount_minor_units INTEGER NOT NULL,
  source_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  exchange_rate DECIMAL NOT NULL,
  exchange_rate_locked_at TIMESTAMPTZ,
  exchange_rate_provider TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);

-- Expense shares table
CREATE TABLE IF NOT EXISTS expense_shares (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_amount_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_shares_expense ON expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_user ON expense_shares(user_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Grocery items table
CREATE TABLE IF NOT EXISTS grocery_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  quantity TEXT,
  notes TEXT,
  is_purchased BOOLEAN DEFAULT FALSE,
  purchased_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_items_trip ON grocery_items(trip_id);

-- Grocery participants table
CREATE TABLE IF NOT EXISTS grocery_item_participants (
  id SERIAL PRIMARY KEY,
  grocery_item_id INTEGER NOT NULL REFERENCES grocery_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grocery_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_participants_item ON grocery_item_participants(grocery_item_id);

-- Grocery receipts table
CREATE TABLE IF NOT EXISTS grocery_receipts (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receipt_url TEXT NOT NULL,
  total_amount_minor_units INTEGER,
  currency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_receipts_trip ON grocery_receipts(trip_id);

-- Flights table
CREATE TABLE IF NOT EXISTS flights (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ,
  airline TEXT,
  airline_code TEXT,
  flight_number TEXT,
  confirmation_number TEXT,
  notes TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_trip ON flights(trip_id);

-- Hotels table
CREATE TABLE IF NOT EXISTS hotels (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  check_in_date TIMESTAMPTZ,
  check_out_date TIMESTAMPTZ,
  confirmation_number TEXT,
  notes TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_trip ON hotels(trip_id);

-- Restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  cuisine TEXT,
  reservation_time TIMESTAMPTZ,
  confirmation_number TEXT,
  notes TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_trip ON restaurants(trip_id);

-- Hotel proposals table
CREATE TABLE IF NOT EXISTS hotel_proposals (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  check_in_date TIMESTAMPTZ,
  check_out_date TIMESTAMPTZ,
  price_per_night DECIMAL,
  currency TEXT,
  rating DECIMAL,
  image_url TEXT,
  notes TEXT,
  data JSONB,
  status TEXT DEFAULT 'pending',
  saved_hotel_id INTEGER REFERENCES hotels(id) ON DELETE SET NULL,
  voting_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_proposals_trip ON hotel_proposals(trip_id);
CREATE INDEX IF NOT EXISTS idx_hotel_proposals_status ON hotel_proposals(status);

-- Hotel rankings table
CREATE TABLE IF NOT EXISTS hotel_rankings (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES hotel_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_rankings_proposal ON hotel_rankings(proposal_id);

-- Flight proposals table
CREATE TABLE IF NOT EXISTS flight_proposals (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ,
  airline TEXT,
  flight_number TEXT,
  price DECIMAL,
  currency TEXT,
  notes TEXT,
  data JSONB,
  status TEXT DEFAULT 'pending',
  saved_flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL,
  voting_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_proposals_trip ON flight_proposals(trip_id);
CREATE INDEX IF NOT EXISTS idx_flight_proposals_status ON flight_proposals(status);

-- Flight rankings table
CREATE TABLE IF NOT EXISTS flight_rankings (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES flight_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_flight_rankings_proposal ON flight_rankings(proposal_id);

-- Restaurant proposals table
CREATE TABLE IF NOT EXISTS restaurant_proposals (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  cuisine TEXT,
  price_range TEXT,
  rating DECIMAL,
  image_url TEXT,
  notes TEXT,
  data JSONB,
  status TEXT DEFAULT 'pending',
  saved_restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  voting_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_proposals_trip ON restaurant_proposals(trip_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_proposals_status ON restaurant_proposals(status);

-- Restaurant rankings table
CREATE TABLE IF NOT EXISTS restaurant_rankings (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES restaurant_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_rankings_proposal ON restaurant_rankings(proposal_id);

-- Travel tips table
CREATE TABLE IF NOT EXISTS travel_tips (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trip_calendars(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  priority TEXT DEFAULT 'medium',
  data JSONB,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_tips_trip ON travel_tips(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_tips_category ON travel_tips(category);

-- User tip preferences table
CREATE TABLE IF NOT EXISTS user_tip_preferences (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  categories TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Session table (for express-session with connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- Mobile push device registrations (iOS APNs tokens)
CREATE TABLE IF NOT EXISTS user_push_devices (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_push_devices_user_enabled
  ON user_push_devices(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_user_push_devices_token
  ON user_push_devices(token);

-- Trip documents table for secure document storage
-- Each document can only be viewed by the user who uploaded it
CREATE TABLE IF NOT EXISTS trip_documents (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trip_calendars(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip ON trip_documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_documents_user ON trip_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_documents_category ON trip_documents(category);

-- Flight RSVP responses (for "Save for Me" mode - confirmed bookings shared with group)
CREATE TABLE IF NOT EXISTS flight_rsvps (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flight_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_flight_rsvps_flight ON flight_rsvps(flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_rsvps_user ON flight_rsvps(user_id);

-- Hotel RSVP responses (for "Save for Me" mode - confirmed bookings shared with group)
CREATE TABLE IF NOT EXISTS hotel_rsvps (
  id SERIAL PRIMARY KEY,
  hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_rsvps_hotel ON hotel_rsvps(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rsvps_user ON hotel_rsvps(user_id);

-- Restaurant RSVP responses (for "Save for Me" mode - confirmed bookings shared with group)
CREATE TABLE IF NOT EXISTS restaurant_rsvps (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_rsvps_restaurant ON restaurant_rsvps(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_rsvps_user ON restaurant_rsvps(user_id);
