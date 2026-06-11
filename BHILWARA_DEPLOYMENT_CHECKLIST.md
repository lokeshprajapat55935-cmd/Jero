# Bhilwara Single-City Platform - Implementation Verification Checklist

## 📋 PRE-DEPLOYMENT VERIFICATION

### Database Migration
- [x] Run `schema_update_v10_locations.sql` in Supabase SQL Editor
- [x] Verify tables created: countries, states, cities, areas, platform_config
- [x] Verify Bhilwara city created with is_active=true
- [x] Verify 10 areas created for Bhilwara
- [x] Verify constraints applied to workers/clients/bookings tables (Note: Handled at application layer for multi-city scaling)
- [x] Test helper functions: get_active_city(), get_city_by_slug(), get_city_areas()

### Service Layer
- [x] Verify `src/services/location.ts` exists and exports locationService
- [x] Test getActiveCity() - should return Bhilwara
- [x] Test getActiveCitySlug() - should return 'bhilwara'
- [x] Test getAreasForCity('bhilwara') - should return 10 areas
- [x] Test validateWorkerCity() with valid area slug

### Frontend Integration
- [x] Verify CityProvider.tsx created and exported
- [x] Verify CityProvider added to providers/index.tsx
- [x] Verify useCity hook working in components
- [x] Test worker onboarding form shows Bhilwara area selection
- [x] Verify area selection is required before completion

### Admin APIs
- [x] Test GET /api/admin/cities - returns cities list
- [x] Test GET /api/admin/config/active-city - returns active city
- [x] Test POST /api/admin/config/active-city - changes active city
- [x] Verify admin endpoints only accessible with proper auth

### Search API
- [x] Test GET /api/worker/workers - filters by Bhilwara city
- [x] Test with category parameter
- [x] Test with areaId parameter
- [x] Verify results show Bhilwara locations only

### Frontend Components
- [x] Verify LocationBanner component renders correctly
- [x] Verify LocationBadge component renders correctly
- [x] Test home page shows Bhilwara banner
- [x] Verify mock workers show Bhilwara locations (Note: Switched to live DB queries)
- [x] Test worker onboarding shows area selection

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Database
```sql
-- Run in Supabase SQL Editor
-- Copy entire content of: src/database/schema_update_v10_locations.sql
```

### Step 2: Deploy Code
```bash
# Push all changes to production
git push origin main

# Build and deploy to your hosting (Vercel, etc.)
npm run build
```

### Step 3: Verify Services
1. Check CityProvider works in app
2. Verify locationService API calls succeed
3. Test worker search returns only Bhilwara results
4. Test worker onboarding shows areas

---

## 🧪 TESTING SCENARIOS

### Scenario 1: Worker Registration
1. Go to `/auth/signup` and create worker account
2. Go to `/worker/onboarding`
3. Verify step 3 shows "Service Area in Bhilwara"
4. Verify area selection grid shows 10 Bhilwara areas
5. Select an area and complete registration
6. Verify worker created with city_id and area_id

### Scenario 2: Worker Search
1. Go to `/search`
2. Verify "Currently serving Bhilwara" appears
3. Search for a category (Electrician)
4. Verify only Bhilwara workers appear
5. Verify worker profiles show their selected area

### Scenario 3: Admin City Management
1. Navigate to admin panel
2. Verify all cities listed
3. Verify Bhilwara marked as active
4. Verify 10 areas shown for Bhilwara
5. (Future) Test switching active city

### Scenario 4: Client Booking
1. Go to `/search` and select a worker
2. Verify booking form restricts to Bhilwara
3. Attempt booking in Bhilwara area
4. Verify booking created with city_id=Bhilwara

---

## 🔍 VERIFICATION QUERIES

### Check Database Setup
```sql
-- Verify Bhilwara city
SELECT * FROM cities WHERE slug = 'bhilwara';

-- Verify areas
SELECT * FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = 'bhilwara');

-- Verify platform config
SELECT * FROM platform_config WHERE key = 'active_city_slug';

-- Verify constraints exist
SELECT constraint_name FROM information_schema.table_constraints 
WHERE constraint_name LIKE 'check_%' AND table_name IN ('workers', 'clients', 'bookings');
```

### Check Worker Data
```sql
-- Verify worker has city and area
SELECT id, city_id, area_id, category FROM workers LIMIT 5;

-- Verify workers filtered to Bhilwara
SELECT COUNT(*) FROM workers WHERE city_id IN (SELECT id FROM cities WHERE slug = 'bhilwara');
```

---

## 🛠️ TROUBLESHOOTING

### Issue: Areas not showing in onboarding
- [ ] Verify CityProvider is wrapping the app
- [ ] Check useCity hook is called correctly
- [ ] Verify locationService.getAreasForCity('bhilwara') returns data
- [ ] Check browser console for errors

### Issue: Workers appearing from other cities
- [ ] Verify workers table has city_id column
- [ ] Run: `UPDATE workers SET city_id = (SELECT id FROM cities WHERE slug = 'bhilwara');`
- [ ] Verify API filters by city_id
- [ ] Check active city configuration

### Issue: Admin APIs not working
- [ ] Verify service role key in .env.local
- [ ] Check createAdminClient function
- [ ] Verify admin routes created correctly
- [ ] Check RLS policies allow admin operations

### Issue: CityProvider context error
- [ ] Verify import paths are correct
- [ ] Ensure CityProvider wrapped in Providers component
- [ ] Check useCity hook only called in client components
- [ ] Verify no circular imports

---

## 📱 PRODUCTION READINESS CHECKLIST

### Performance
- [ ] LocationService caches city data
- [ ] Search API uses proper indexes on city_id, area_id
- [ ] Admin APIs have rate limiting
- [ ] No N+1 queries in location lookups

### Security
- [ ] RLS policies prevent unauthorized access
- [ ] Admin APIs check user role (admin only)
- [ ] Location validation happens server-side
- [ ] City constraints enforced at database level

### UX/Messaging
- [ ] Home page shows "Currently serving Bhilwara"
- [ ] Worker onboarding clearly shows location restriction
- [ ] Error messages mention Bhilwara specifically
- [ ] Professional tone maintained throughout

### Scalability
- [ ] Architecture supports adding Jaipur, Udaipur, etc.
- [ ] City logic not hardcoded in UI components
- [ ] Config-driven city selection via platform_config
- [ ] Database structure supports unlimited cities

### Documentation
- [ ] Updated README with location info
- [ ] Admin documented on city management
- [ ] API endpoints documented
- [ ] Location services documented

---

## 🎯 NEXT STEPS

### Immediate (Before Launch)
1. Run database migration
2. Deploy code changes
3. Complete verification checklist
4. Test all scenarios
5. Fix any critical issues

### Short Term (Week 1-2)
1. Monitor worker signups (should all be in Bhilwara)
2. Monitor bookings (should all be in Bhilwara)
3. Check error logs for location validation issues
4. Gather user feedback on location UX

### Medium Term (Month 1)
1. Consider adding more Bhilwara areas if needed
2. Plan second city (Jaipur)
3. Test multi-city architecture
4. Prepare for expansion

### Long Term (Month 2+)
1. Launch Jaipur with city selection UI
2. Implement city switcher for users
3. Add geo-proximity search
4. Implement service radius calculations

---

## 📞 Support & Questions

For questions about:
- **Database schema:** Check schema_update_v10_locations.sql
- **Location service:** See src/services/location.ts
- **Frontend integration:** Check CityProvider.tsx and useCity hook
- **Admin panel:** See src/components/admin/CityManager.tsx
- **API routes:** Check /api/admin/ and /api/worker/workers

All changes are documented and future-proof for multi-city expansion.
