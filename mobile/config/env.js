/**
 * Environment Configuration for Zolvo Mobile App
 * 
 * Note: In a production React Native environment, use react-native-dotenv
 * or a similar package to load these securely from a .env file.
 */

// Placeholder for environment variables
// Replace with actual logic to fetch from process.env or native config
export const ENV = {
    // API Endpoints
    API_BASE_URL: process.env.API_BASE_URL || "https://api.zolvo.in",
    
    // Feature Flags
    DEBUG_MODE: __DEV__,
};

export default ENV;
