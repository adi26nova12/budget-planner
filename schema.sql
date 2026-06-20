-- SQL script to initialize the database in Supabase
-- Go to your Supabase project -> SQL Editor -> New Query, paste this script and click Run.

CREATE TABLE IF NOT EXISTS monthly_budgets (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    year TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, month, year)
);

-- Enable Row Level Security (RLS)
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;

-- Create policies restricted to authenticated owners of the data
CREATE POLICY "Allow users to read their own budgets" ON monthly_budgets
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own budgets" ON monthly_budgets
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own budgets" ON monthly_budgets
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

