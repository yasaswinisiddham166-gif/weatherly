# Weatherly

A responsive React weather dashboard that shows current conditions, detailed weather metrics, hourly outlook, and a five-day forecast. Search for cities, save recent searches, browse popular Indian cities, or use your device’s location.

## Features

- Search weather by city name
- View the current temperature, weather condition, and weather icon
- See feels-like temperature, humidity, wind speed, atmospheric pressure, visibility, sunrise, and sunset
- Browse an hourly weather outlook and five-day forecast
- Switch between Celsius and Fahrenheit
- Access the five most recently searched cities
- View current weather for Hyderabad, Bengaluru, Chennai, Mumbai, and Delhi
- Use browser geolocation to find local weather
- Responsive layout for desktop, tablet, and mobile
- Loading, error, and retry states

## Built With

- React
- Vite
- Lucide React
- Open-Meteo Geocoding API and Forecast API
- OpenStreetMap Nominatim for reverse geocoding

## Getting Started

### Requirements

- Node.js
- npm

### Installation

Clone the repository or open the project folder, then run:

```bash
npm install
```

### Start the Development Server

```bash
npm run dev
```

Open the local URL displayed in your terminal, usually `http://localhost:5173/`.

### Build for Production

```bash
npm run build
```

### Preview the Production Build

```bash
npm run preview
```

## Notes

- Open-Meteo provides weather forecasts and geocoding services.
- Browser geolocation requires user permission and works in secure contexts, such as HTTPS or localhost.
- Reverse geocoding depends on the availability of the OpenStreetMap Nominatim service.

## License

This project is intended for educational and personal use.
