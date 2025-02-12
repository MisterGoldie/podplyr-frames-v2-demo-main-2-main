-- Create the frame_notifications table
CREATE TABLE IF NOT EXISTS frame_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fid BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  button_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
  contract TEXT NOT NULL,
  token_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS frame_notifications_fid_idx ON frame_notifications(fid);
CREATE INDEX IF NOT EXISTS frame_notifications_status_idx ON frame_notifications(status);
CREATE INDEX IF NOT EXISTS frame_notifications_contract_token_idx ON frame_notifications(contract, token_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update updated_at
CREATE TRIGGER update_frame_notifications_updated_at
  BEFORE UPDATE ON frame_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
