import { convertToOpenAITool } from '../tools-handler';
import type { ToolExecutor, } from '../tools-handler';

// Tool executor function
const getWeatherExecutor: ToolExecutor = async (args, context) => {
  try {
    const { latitude, longitude } = args;

    // Validate input parameters
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return {
        success: false,
        error: 'Invalid coordinates: latitude and longitude must be numbers',
      };
    }

    if (latitude < -90 || latitude > 90) {
      return {
        success: false,
        error: 'Invalid latitude: must be between -90 and 90',
      };
    }

    if (longitude < -180 || longitude > 180) {
      return {
        success: false,
        error: 'Invalid longitude: must be between -180 and 180',
      };
    }

    console.log(`Fetching weather for coordinates: ${latitude}, ${longitude}`);

    // Fetch weather data from Open-Meteo API
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Weather API request failed: ${response.status} ${response.statusText}`,
      };
    }

    const weatherData = await response.json();

    // Validate the response structure
    if (!weatherData || !weatherData.current) {
      return {
        success: false,
        error: 'Invalid weather data received from API',
      };
    }

    return {
      success: true,
      result: weatherData,
    };
  } catch (error) {
    console.error('Weather tool error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// OpenAI function definition
const weatherToolDefinition = {
  type: 'object',
  properties: {
    latitude: {
      type: 'number',
      description: 'The latitude coordinate for the location',
      minimum: -90,
      maximum: 90,
    },
    longitude: {
      type: 'number',
      description: 'The longitude coordinate for the location',
      minimum: -180,
      maximum: 180,
    },
  },
  required: ['latitude', 'longitude'],
};

// Register the tool with our system
convertToOpenAITool(
  'getWeather',
  'Get the current weather at a location using latitude and longitude coordinates',
  weatherToolDefinition,
  getWeatherExecutor,
);

// Export for direct usage if needed
export { getWeatherExecutor };
export const weatherToolName = 'getWeather';
