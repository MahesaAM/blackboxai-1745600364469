import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wdvedlmnapxxfvpyfwqa.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkdmVkbG1uYXB4eGZ2cHlmd3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MjE5NzUsImV4cCI6MjA2MDM5Nzk3NX0.yLIbYKF1PfzEo3gMO0H8SgXN8AAPRYgDTJewg8nb7GA'; // Replace with your Supabase anon key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
