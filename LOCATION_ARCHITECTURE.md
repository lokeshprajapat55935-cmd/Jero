# Location/Geo Architecture - Developer Guide

## Overview

Jero is currently configured to operate as a single-city platform serving **Bhilwara, Rajasthan, India**. The architecture is designed to be **scalable and future-proof** for expansion to other cities.

## Current Configuration

- **Active City:** Bhilwara
- **State:** Rajasthan
- **Country:** India
- **Service Areas:** 10 neighborhoods/localities in Bhilwara
- **Mode:** Single-city (can be changed to multi-city via platform_config)

## Architecture Overview

### Database Layer

```
countries
├── states
│   └── cities
│       └── areas (localities/neighborhoods)
└── platform_config (active city configuration)

Worker/Client/Booking tables reference:
├── city_id (FK to cities)
├── area_id (FK to areas)
└── location_name (legacy, for compatibility)
```

### Key Tables

| Table | Purpose | Fields |
|-------|---------|--------|
| `countries` | Country reference | id, code (IN), name (India), dial_code (+91) |
| `states` | State reference | id, country_id, code (RJ), name (Rajasthan) |
| `cities` | Service areas | id, state_id, name, slug, is_active, lat/lon |
| `areas` | Localities/neighborhoods | id, city_id, name, slug, pincode, lat/lon |
| `platform_config` | Platform settings | key, value (active_city_slug, mode) |

### How It Works

1. **Active City Lookup**
   - Query `platform_config` where key = 'active_city_slug'
   - Returns current city slug ('bhilwara')

2. **Worker Registration**
   - Worker selects area from `get_city_areas('bhilwara')`
   - System validates area belongs to Bhilwara
   - Stores city_id (Bhilwara) and area_id (selected area)

3. **Worker Search**
   - Filter workers by: `WHERE city_id = (SELECT id FROM cities WHERE slug = 'bhilwara')`
   - Optionally filter by area_id for locality-specific search

4. **Booking**
   - Validate both worker and client are in same city
   - Store city_id in booking for audit trail

## Service Layer

### Location Service (`src/services/location.ts`)

Central location for all geo logic:

```typescript
// Get active city
const city = await locationService.getActiveCity();

// Get areas for city
const areas = await locationService.getAreasForCity('bhilwara');

// Validate worker registration
const validation = await locationService.validateWorkerCity('subhash-nagar', 'bhilwara');

// Validate client booking
const bookingValid = await locationService.validateClientBooking('bhilwara', workerAreaId);

// Get workers filtered by city
const workers = await locationService.getWorkersByCity('bhilwara', { areaId, category, limit });
```

**Why centralized?** 
- Single source of truth for location logic
- Easy to update location behavior
- Testable location validation
- Prevents duplicate location checks across codebase

## Frontend Layer

### CityProvider (`src/providers/CityProvider.tsx`)

App-wide context for location data:

```typescript
import { useCity } from '@/providers/CityProvider';

function MyComponent() {
  const { activeCity, areas, mode, loading, error } = useCity();
  
  if (loading) return <Skeleton />;
  if (error) return <Error message={error} />;
  
  return (
    <div>
      <p>Current: {activeCity.name}</p>
      <select>
        {areas.map(area => <option>{area.name}</option>)}
      </select>
    </div>
  );
}
```

**Benefits:**
- Location data available throughout app
- Consistent city context
- Easy to add location-based features
- Minimal prop drilling

### Components

**LocationBanner** (`src/components/shared/LocationBanner.tsx`)
- Displays current service area
- Shows professional messaging
- Appears on landing page and key pages

**LocationBadge** (`src/components/shared/LocationBadge.tsx`)
- Compact location indicator
- Used in headers, navigation

**CityManager** (`src/components/admin/CityManager.tsx`)
- Admin interface for city management
- Switch active city
- View areas for each city
- (Extensible for area management)

## API Layer

### Worker Search (`/api/worker/workers`)

```bash
GET /api/worker/workers?category=Electrician&areaId=xxx&sort=rating

# Response includes:
{
  "workers": [...],
  "total": 42,
  "city": "Bhilwara",
  "message": "Found 42 professionals in Bhilwara"
}
```

**Key point:** API automatically filters to active city. No client-side bypass possible.

### Admin APIs

```bash
# Get all cities
GET /api/admin/cities

# Get areas for a city  
GET /api/admin/cities/bhilwara/areas

# Set active city
POST /api/admin/config/active-city
{ "citySlug": "bhilwara" }

# Get current config
GET /api/admin/config/active-city
```

## Database Constraints

### Enforced Constraints (immutable)

```sql
-- Workers can only register in Bhilwara
ALTER TABLE workers ADD CONSTRAINT check_worker_city CHECK (
  city_id IN (SELECT id FROM cities WHERE slug = 'bhilwara')
);

-- Clients can only book in Bhilwara
ALTER TABLE clients ADD CONSTRAINT check_client_city CHECK (
  city_id IN (SELECT id FROM cities WHERE slug = 'bhilwara')
);

-- Bookings must be in Bhilwara
ALTER TABLE bookings ADD CONSTRAINT check_booking_city CHECK (
  city_id IN (SELECT id FROM cities WHERE slug = 'bhilwara')
);
```

**These prevent:**
- Accidental data corruption
- Bypassing validation in buggy code
- Geographic data inconsistencies

## Validation Layer

### Location Validation (`src/lib/validation-geo.ts`)

Utilities for frontend/API validation:

```typescript
// Validate worker registration
const result = await validateWorkerRegistration(areaSlug);
if (!result.valid) toast.error(result.message);

// Validate booking
const bookingOk = await validateClientBooking(workerAreaId);

// Check service availability
const { available, city, message } = await checkServiceAvailability();
```

## Future Expansion - Multi-City

### To add Jaipur:

**Step 1: Database**
```sql
-- Insert into cities
INSERT INTO cities (state_id, name, slug, is_active)
VALUES ((SELECT id FROM states WHERE code='RJ'), 'Jaipur', 'jaipur', false);

-- Insert areas for Jaipur
INSERT INTO areas (city_id, name, slug) VALUES (...);
```

**Step 2: Update Constraints** (make dynamic)
```sql
-- Remove hardcoded Bhilwara constraint
ALTER TABLE workers DROP CONSTRAINT check_worker_city;

-- Replace with logic:
CREATE POLICY "workers_city_policy" ON workers ...
WHERE city_id IN (
  SELECT id FROM cities WHERE is_active = true
);
```

**Step 3: Add City Switcher UI**
```typescript
// User selects city from dropdown
// App filters all results by selection
// CityProvider updates context
```

**Step 4: Deploy**
- Enable new city in admin panel
- Workers/clients can register for new city
- Everything else works automatically

### Why This Is Easy:

✅ No hardcoded city names in code  
✅ Location logic in one place (locationService)  
✅ Database constraints are database-level, not app-level  
✅ CityProvider handles context automatically  
✅ Admin API to switch active city exists  

## SEO Considerations

### Current Setup

- Bhilwara-focused meta tags
- Location in page titles: "Electrician in Bhilwara"
- Structured data includes city
- URLs are location-agnostic (future: could add /bhilwara/search)

### For Multi-City

Could implement:
- `/bhilwara/search` vs `/jaipur/search` for better SEO
- Location-specific sitemaps
- Hreflang tags for location variations
- Local schema markup per city

## Monitoring & Analytics

Track location metrics:
- Registrations by city
- Bookings by area within city
- Search queries by location
- Geographic distribution of services

## Common Tasks

### Add a new area to Bhilwara
```typescript
// In admin panel or API:
POST /api/admin/cities/bhilwara/areas
{
  "name": "Cantonment Area",
  "slug": "cantonment",
  "pincode": "311001"
}
```

### Change active city (admin)
```typescript
// Via admin panel CityManager or API:
POST /api/admin/config/active-city
{ "citySlug": "jaipur" }
```

### Get all workers in an area
```typescript
const workers = await locationService.getWorkersByCity('bhilwara', {
  areaId: 'subhash-nagar-id'
});
```

### Filter workers in search
```bash
# Frontend calls:
GET /api/worker/workers?areaId=xxx
```

## Key Files

| File | Purpose |
|------|---------|
| `supabase/schema_update_v10_locations.sql` | Database schema |
| `src/services/location.ts` | Location service logic |
| `src/providers/CityProvider.tsx` | App-wide city context |
| `src/lib/validation-geo.ts` | Location validation utilities |
| `src/components/shared/LocationBanner.tsx` | Location UI components |
| `src/components/admin/CityManager.tsx` | Admin city management |
| `src/app/api/admin/cities/*` | Admin APIs |
| `src/app/api/worker/workers/route.ts` | Worker search (geo-filtered) |
| `src/app/worker/onboarding/page.tsx` | Worker registration with areas |

## Testing

### Unit Tests (location service)
```typescript
describe('locationService', () => {
  it('should validate worker in Bhilwara', async () => {
    const result = await locationService.validateWorkerCity('subhash-nagar');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid area', async () => {
    const result = await locationService.validateWorkerCity('invalid-area');
    expect(result.valid).toBe(false);
  });
});
```

### Integration Tests
- User registrations create correct city_id
- Search API filters by city
- Admin can switch active city
- Constraints prevent invalid data

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Areas not loading | Check CityProvider wrapping, verify useCity hook |
| Workers from wrong city | Verify city_id filtering in API, check constraints |
| Admin APIs fail | Check service role key, verify RLS policies |
| Onboarding doesn't save city_id | Verify locationService.validateWorkerCity called |

## Philosophy

**"Config, not code"** - Geographic logic lives in database config, not hardcoded  
**"Centralized"** - All location logic in locationService  
**"Scalable"** - Architecture built for multi-city from day 1  
**"Validated"** - Every location action validated at database level  
**"User-friendly"** - Professional messaging, natural UX  

---

**Last Updated:** May 2026  
**Status:** Production Ready (Bhilwara) | Architecture Ready (Multi-city)
