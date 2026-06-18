require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

async function seedAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase environment variables.');
    process.exit(1);
  }

  if (!adminUsername || !adminPassword) {
    console.error('Error: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Seeding admin account...');

  try {
    // 1. Check if an admin with this username already exists in profiles
    const { data: existingAdmin, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', adminUsername)
      .eq('role', 'admin')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError; // PGRST116 means no rows found
    }

    if (existingAdmin) {
      console.log(`Admin account for ${adminUsername} already exists. Skipping.`);
      return;
    }

    // Generate a secure hash for the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // Create a new UUID for the admin
    const adminId = randomUUID();

    // 2. Insert into profiles table
    console.log('Creating admin profile...');
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: adminId, // Notice: This admin won't have a corresponding auth.users row if they only use our isolated login
        email: adminUsername,
        username: adminUsername,
        role: 'admin',
        admin_role: 'super_admin',
        onboarded: true,
        full_name: 'Super Admin',
      });

    if (profileError) {
      // If foreign key constraint on auth.users fails, we might need to actually create a Supabase Auth user first.
      // But typically profiles has an id column referencing auth.users.
      console.error('Profile creation error. Notice: If profiles.id enforces an FK constraint to auth.users, we must create a Supabase Auth user first.');
      throw profileError;
    }

    // 3. Insert into admin_secrets
    console.log('Storing admin credentials...');
    const { error: secretsError } = await supabase
      .from('admin_secrets')
      .insert({
        admin_id: adminId,
        password_hash: passwordHash,
      });

    if (secretsError) {
      throw secretsError;
    }

    console.log('✅ Default super_admin account successfully seeded!');

  } catch (error) {
    console.error('Failed to seed admin:', error.message);
    // If it's a foreign key constraint, we will try alternative method:
    if (error.code === '23503') {
        console.error('Foreign key constraint violation. Falling back to creating Supabase Auth User first.');
        await fallbackSeedAuthUser(supabase, adminUsername, adminPassword);
    } else {
        process.exit(1);
    }
  }
}

async function fallbackSeedAuthUser(supabase, adminUsername, adminPassword) {
    console.log('Attempting to create Auth user...');
    // Create via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: adminUsername,
        password: adminPassword,
        email_confirm: true,
    });

    if (authError) {
        console.error('Auth User creation failed:', authError.message);
        process.exit(1);
    }

    const adminId = authData.user.id;

    console.log('Updating profile role to admin...');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        role: 'admin',
        admin_role: 'super_admin'
      })
      .eq('id', adminId);

    if (updateError) {
        console.error('Failed to update profile role:', updateError.message);
    }

    // Generate a secure hash for the password to store in admin_secrets as well (for isolated login)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    console.log('Storing admin credentials in admin_secrets...');
    const { error: secretsError } = await supabase
      .from('admin_secrets')
      .insert({
        admin_id: adminId,
        password_hash: passwordHash,
      });

    if (secretsError) {
        console.error('Failed to store secrets:', secretsError.message);
    } else {
        console.log('✅ Default super_admin account successfully seeded via Auth Fallback!');
    }
}

seedAdmin();
