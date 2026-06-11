/**
 * Location validation utilities
 * Enforces geo-restrictions for workers, clients, and bookings
 */

import { locationService } from '@/services/location';

/**
 * Validate worker registration location
 * Ensures worker is registering for the active city only
 */
export async function validateWorkerRegistration(areaSlug: string): Promise<{
  valid: boolean;
  areaId?: string | null;
  cityId?: string;
  message: string;
}> {
  try {
    const activeCity = await locationService.getActiveCity();
    
    if (!activeCity) {
      return {
        valid: false,
        message: 'No active city configured. Please contact support.'
      };
    }

    const validation = await locationService.validateWorkerCity(areaSlug, activeCity.slug);
    
    if (!validation.valid) {
      return {
        valid: false,
        message: `You can only register in ${activeCity.name} at this time.`
      };
    }

    // Get area details for city_id
    const area = await locationService.getAreaBySlug(activeCity.slug, areaSlug);
    
    return {
      valid: true,
      areaId: validation.areaId ?? undefined,
      cityId: activeCity.id,
      message: 'Worker location is valid'
    };
  } catch (error) {
    console.error('Worker registration validation error:', error);
    return {
      valid: false,
      message: 'Location validation failed. Please try again.'
    };
  }
}

/**
 * Validate client booking location
 * Ensures client is booking in the active city only
 */
export async function validateClientBooking(
  clientAreaSlug?: string,
  workerAreaId?: string
): Promise<{
  valid: boolean;
  message: string;
}> {
  try {
    const activeCity = await locationService.getActiveCity();
    
    if (!activeCity) {
      return {
        valid: false,
        message: 'Service is currently not available in your area.'
      };
    }

    if (workerAreaId) {
      const validation = await locationService.validateClientBooking(
        activeCity.slug,
        workerAreaId,
        activeCity.slug
      );
      return validation;
    }

    return {
      valid: true,
      message: 'Booking location is valid'
    };
  } catch (error) {
    console.error('Booking validation error:', error);
    return {
      valid: false,
      message: 'Booking validation failed.'
    };
  }
}

/**
 * Check if user is in the service area
 * Shows appropriate message if not
 */
export async function checkServiceAvailability(): Promise<{
  available: boolean;
  city: string;
  message: string;
}> {
  try {
    const activeCity = await locationService.getActiveCity();
    
    if (!activeCity || !activeCity.is_active) {
      return {
        available: false,
        city: 'Unknown',
        message: 'Service is currently not available. We are launching city-by-city.'
      };
    }

    return {
      available: true,
      city: activeCity.name,
      message: `Service available in ${activeCity.name}`
    };
  } catch (error) {
    console.error('Service availability check error:', error);
    return {
      available: false,
      city: 'Unknown',
      message: 'Unable to check service availability.'
    };
  }
}

/**
 * Validate that a user can perform location-based action
 * Generic validation that can be used in multiple contexts
 */
export async function validateLocationAccess(
  userCity?: string,
  allowedCities: string[] = ['bhilwara']
): Promise<{
  allowed: boolean;
  message: string;
}> {
  try {
    const activeCity = await locationService.getActiveCity();
    
    if (!activeCity) {
      return {
        allowed: false,
        message: 'Service not available in your area.'
      };
    }

    // Check if active city is in allowed cities
    if (!allowedCities.includes(activeCity.slug)) {
      return {
        allowed: false,
        message: `Service not available. Currently operating in: ${activeCity.name}`
      };
    }

    return {
      allowed: true,
      message: `Access allowed in ${activeCity.name}`
    };
  } catch (error) {
    console.error('Location access validation error:', error);
    return {
      allowed: false,
      message: 'Unable to validate access.'
    };
  }
}
