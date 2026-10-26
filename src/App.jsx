import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, Wind, Droplets, Eye, Gauge, Sunrise, Sunset, CloudSun, Cloud, Sun, CloudRain, CloudDrizzle, CloudLightning, CloudFog, Snowflake, LoaderCircle, CalendarDays, Compass, Thermometer, LocateFixed } from 'lucide-react';

const POPULAR_CITIES = ['Hyderabad', 'Bengaluru', 'Chennai', 'Mumbai', 'Delhi'];
const RECENTS_KEY = 'weatherly-recent-cities';
const popularCache = new Map();

function weatherInfo(code) {
  if (code === 0) return { label: 'Clear sky', Icon: Sun };
  if ([1, 2].includes(code)) return { label: code === 1 ? 'Mainly clear' : 'Partly cloudy', Icon: CloudSun };
  if (code === 3) return { label: 'Overcast', Icon: Cloud };
  if ([45, 48].includes(code)) return { label: 'Foggy', Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain showers', Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snowfall', Icon: Snowflake };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', Icon: CloudLightning };
  return { label: 'Cloudy', Icon: CloudSun };
}

function moodFor(code) {
  if (code === 0) return 'clear';
  if ([1, 2].includes(code)) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  return 'storm';
}

const formatTime = (value, timezone) => value ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value)) : '—';
const dateLabel = (value, options = { weekday: 'short', month: 'short', day: 'numeric' }) => new Intl.DateTimeFormat('en', options).format(new Date(`${value}T12:00:00`));

async function checkedJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 429) throw new Error('The weather service is busy. Please wait a moment and try again.');
    if (response.status >= 500) throw new Error('The weather service is temporarily unavailable. Please try again.');
    throw new Error(`Weather request failed (${response.status}). Please try again.`);
  }
  const data = await response.json();
  if (data.error) throw new Error(data.reason || 'The weather service returned an invalid response.');
  return data;
}

function weatherParams(latitude, longitude, days = 5) {
  return new URLSearchParams({ latitude, longitude, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,pressure_msl,visibility', hourly: 'temperature_2m,precipitation_probability,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset', timezone: 'auto', forecast_days: String(days) });
}

function App() {
  const [query, setQuery] = useState('Bengaluru');
  const [place, setPlace] = useState(null);
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [unit, setUnit] = useState('celsius');
  const [recentCities, setRecentCities] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
  });
  const [popular, setPopular] = useState({});
  const [popularStatus, setPopularStatus] = useState('loading');
  const [popularRetry, setPopularRetry] = useState(0);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationError, setLocationError] = useState('');
  const requestSequence = useRef(0);
  const activeController = useRef(null);
  const current = weather?.current;

  const getCityWeather = useCallback(async (city, { saveRecent = true } = {}) => {
    const name = city.trim();
    if (!name) { setError('Enter a city name to search.'); return; }
    activeController.current?.abort();
    setLocationStatus('idle');
    const controller = new AbortController();
    activeController.current = controller;
    const sequence = ++requestSequence.current;
    setStatus('loading'); setError(''); setLocationError('');
    try {
      const geo = await checkedJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`, controller.signal);
      const found = geo.results?.[0];
      if (!found) throw new Error(`We couldn't find “${name}”. Check the spelling and try again.`);
      const params = weatherParams(found.latitude, found.longitude);
      const data = await checkedJson(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal);
      if (!data.current || !data.daily?.time?.length) throw new Error('The weather service returned incomplete data. Please try again.');
      if (sequence !== requestSequence.current) return;
      setPlace(found); setWeather(data); setQuery(found.name); setStatus('ready');
      if (saveRecent) {
        const item = { name: found.name, country: found.country, admin1: found.admin1, latitude: found.latitude, longitude: found.longitude };
        setRecentCities((old) => {
          const updated = [item, ...old.filter((entry) => !(entry.name.toLowerCase() === item.name.toLowerCase() && entry.country === item.country))].slice(0, 5);
          try { localStorage.setItem(RECENTS_KEY, JSON.stringify(updated)); } catch { /* Storage may be unavailable. */ }
          return updated;
        });
      }
    } catch (err) {
      if (err.name === 'AbortError' || sequence !== requestSequence.current) return;
      setError(err.message || 'Could not load weather. Check your connection and try again.'); setStatus('error');
    }
  }, []);

  useEffect(() => {
    getCityWeather('Bengaluru');
    return () => { activeController.current?.abort(); requestSequence.current += 1; };
  }, [getCityWeather]);

  useEffect(() => {
    let cancelled = false;
    setPopularStatus('loading');
    Promise.all(POPULAR_CITIES.map(async (city) => {
      if (!popularCache.has(city)) {
        const request = (async () => {
          const geo = await checkedJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
          const found = geo.results?.[0];
          if (!found) throw new Error(`No location found for ${city}`);
          const data = await checkedJson(`https://api.open-meteo.com/v1/forecast?${weatherParams(found.latitude, found.longitude, 1)}`);
          return { place: found, weather: data };
        })();
        popularCache.set(city, request);
        request.catch(() => popularCache.delete(city));
      }
      try { return [city, await popularCache.get(city)]; } catch (err) { return [city, { error: err.message }]; }
    })).then((entries) => {
      if (cancelled) return;
      setPopular(Object.fromEntries(entries));
      setPopularStatus(entries.every(([, value]) => value.error) ? 'error' : 'ready');
    });
    return () => { cancelled = true; };
  }, [popularRetry]);

  const hourly = useMemo(() => {
    if (!weather?.hourly || !current) return [];
    const foundIndex = weather.hourly.time.findIndex((time) => time.slice(0, 13) === current.time.slice(0, 13));
    const start = Math.max(0, foundIndex);
    return weather.hourly.time.slice(start, start + 12).map((time, index) => ({ time, temp: weather.hourly.temperature_2m[start + index], rain: weather.hourly.precipitation_probability?.[start + index], code: weather.hourly.weather_code[start + index] }));
  }, [weather, current]);

  const temp = (value) => value == null || !Number.isFinite(Number(value)) ? '—' : Math.round(unit === 'fahrenheit' ? Number(value) * 9 / 5 + 32 : Number(value));
  const unitMark = unit === 'celsius' ? '°C' : '°F';
  const condition = current ? weatherInfo(current.weather_code) : { label: 'Loading weather', Icon: CloudSun };
  const CurrentIcon = condition.Icon;
  const localDate = weather?.daily?.time?.[0] ? dateLabel(weather.daily.time[0], { weekday: 'long', month: 'long', day: 'numeric' }) : 'Your local forecast';
  const submitSearch = (event) => { event.preventDefault(); getCityWeather(query); };

  const useLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('Location is not supported by this browser.'); return; }
    activeController.current?.abort();
    const sequence = ++requestSequence.current;
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (sequence !== requestSequence.current) return;
      const controller = new AbortController(); activeController.current = controller;
      setStatus('loading'); setError('');
      try {
        const params = weatherParams(coords.latitude, coords.longitude);
        const [data, reverse] = await Promise.all([
          checkedJson(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal),
          fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).catch(() => null),
        ]);
        if (!data.current || !data.daily?.time?.length) throw new Error('The weather service returned incomplete data.');
        if (sequence !== requestSequence.current) return;
        const address = reverse?.address || {};
        const resolvedName = address.city || address.town || address.village || address.county || 'Your location';
        const resolvedPlace = { name: resolvedName, country: address.country || '', country_code: (address.country_code || '').toUpperCase(), admin1: address.state || '', latitude: coords.latitude, longitude: coords.longitude };
        setPlace(resolvedPlace); setWeather(data); setQuery(resolvedName); setStatus('ready');
        const item = { name: resolvedPlace.name, country: resolvedPlace.country, admin1: resolvedPlace.admin1, latitude: coords.latitude, longitude: coords.longitude };
        setRecentCities((old) => { const updated = [item, ...old.filter((entry) => !(entry.name === item.name && entry.country === item.country))].slice(0, 5); try { localStorage.setItem(RECENTS_KEY, JSON.stringify(updated)); } catch { /* Storage may be unavailable. */ } return updated; });
      } catch (err) { if (err.name !== 'AbortError' && sequence === requestSequence.current) { setError(err.message || 'Could not load weather for your location.'); setStatus('error'); } }
      setLocationStatus('idle');
    }, (err) => {
      if (sequence !== requestSequence.current) return;
      setLocationStatus('idle');
      setLocationError(err.code === 1 ? 'Location permission was denied. You can still search for a city.' : err.code === 3 ? 'Location request timed out. Please try again.' : 'Your location is unavailable. Please try again.');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Weatherly home"><span className="brand-mark"><CloudSun size={21} /></span><span>weatherly<span className="brand-period">.</span></span></a>
        <div className="topbar-right">
          <form className="search-box" onSubmit={submitSearch} role="search">
            <Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="city-search">Search weather by city</label><input id="city-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search city..." autoComplete="off" /><button type="submit" aria-label="Search weather"><Search size={15} /><span>Search</span></button>
          </form>
          <div className="unit-toggle" role="group" aria-label="Temperature unit"><button type="button" onClick={() => setUnit('celsius')} className={unit === 'celsius' ? 'selected' : ''} aria-pressed={unit === 'celsius'}>°C</button><span>/</span><button type="button" onClick={() => setUnit('fahrenheit')} className={unit === 'fahrenheit' ? 'selected' : ''} aria-pressed={unit === 'fahrenheit'}>°F</button></div>
        </div>
      </header>

      <section className="welcome-row"><div><p className="eyebrow">YOUR PERSONAL FORECAST</p><h1>Weather, at a glance<span className="title-dot">.</span></h1></div><div className="date-pill"><CalendarDays size={15} />{localDate}</div></section>
      <div className="actions-row"><button className="location-button" type="button" onClick={useLocation} disabled={locationStatus === 'loading'}><LocateFixed size={15} />{locationStatus === 'loading' ? 'Finding location…' : 'Use my location'}</button></div>
      {(locationError || error) && <div className="error-banner" role="alert"><span>{locationError || error}</span>{error && <button onClick={() => getCityWeather(query)}>Retry</button>}</div>}

      <div className="dashboard">
        <section className={`current-card weather-${current ? moodFor(current.weather_code) : 'loading'}`} aria-label="Current weather" aria-busy={status === 'loading'}>
          <div className="current-top"><div><span className="live-dot" /> CURRENT WEATHER</div><span className="current-date">{current ? formatTime(current.time, weather.timezone) : '—'}</span></div>
          <div className="place-line"><MapPin size={17} /><span>{place ? `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}` : status === 'loading' ? 'Loading location…' : 'Location unavailable'}</span><span className="country-code">{place?.country || ' '}</span></div>
          <div className="current-main"><div className="temperature">{current ? temp(current.temperature_2m) : '—'}<span>{unitMark}</span></div><div className="condition-display"><CurrentIcon className="condition-icon" size={70} strokeWidth={1.4} /><div>{condition.label}<small>Feels like {current ? `${temp(current.apparent_temperature)}${unitMark}` : '—'}</small></div></div></div>
          {status === 'loading' && <div className="loading-overlay"><LoaderCircle className="spin" size={22} /> Loading weather</div>}
        </section>

        <section className="details-card"><SectionHeading eyebrow="RIGHT NOW" title="Weather details" icon={Compass} /><div className="metrics-grid">
          <Metric icon={Thermometer} label="Feels like" value={current ? `${temp(current.apparent_temperature)}${unitMark}` : '—'} tone="amber" />
          <Metric icon={Droplets} label="Humidity" value={current?.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : '—'} tone="blue" />
          <Metric icon={Wind} label="Wind speed" value={current?.wind_speed_10m != null ? `${Math.round(current.wind_speed_10m)} ${weather.current_units.wind_speed_10m}` : '—'} tone="purple" />
          <Metric icon={Gauge} label="Pressure" value={current?.pressure_msl != null ? `${Math.round(current.pressure_msl)} hPa` : '—'} tone="teal" />
          <Metric icon={Eye} label="Visibility" value={current?.visibility != null ? `${(current.visibility / 1000).toFixed(1)} km` : '—'} tone="blue" />
          <Metric icon={Sunrise} label="Sunrise · Sunset" value={weather?.daily?.sunrise?.[0] ? `${formatTime(weather.daily.sunrise[0], weather.timezone)} · ${formatTime(weather.daily.sunset[0], weather.timezone)}` : '—'} tone="amber" />
        </div></section>
      </div>

      <section className="forecast-card"><SectionHeading eyebrow="PLAN AHEAD" title="Today's outlook" trailing={<span className="subtle-label"><span className="forecast-dot" /> HOURLY FORECAST</span>} /><div className="hourly-row">{hourly.map((item, index) => { const { Icon } = weatherInfo(item.code); return <div className={`hour-item ${index === 0 ? 'hour-now' : ''}`} key={item.time}><span className="hour-time">{index === 0 ? 'Now' : formatTime(item.time, weather.timezone)}</span><Icon size={22} /><strong>{temp(item.temp)}°</strong><span className="rain-chance"><Droplets size={11} />{item.rain ?? '—'}%</span></div>; })}{!hourly.length && <ForecastPlaceholder status={status} />}</div></section>

      <section className="forecast-card week-card"><SectionHeading eyebrow="THE WEEK AHEAD" title="5-day forecast" trailing={<span className="subtle-label">LOCAL FORECAST</span>} /><div className="five-day-grid">{weather?.daily?.time?.slice(0, 5).map((date, index) => { const { label, Icon } = weatherInfo(weather.daily.weather_code[index]); return <article className="day-card" key={date}><span className="day-name">{index === 0 ? 'Today' : dateLabel(date, { weekday: 'short' })}</span><span className="day-date">{dateLabel(date, { month: 'short', day: 'numeric' })}</span><Icon size={29} className="day-icon" /><span className="day-condition">{label}</span><div className="day-temperatures"><span>{temp(weather.daily.temperature_2m_min[index])}°</span><strong>{temp(weather.daily.temperature_2m_max[index])}°</strong></div></article>; })}{!weather && status === 'loading' && <ForecastPlaceholder status={status} />}</div></section>

      {recentCities.length > 0 && <section className="support-section"><SectionHeading eyebrow="QUICK ACCESS" title="Recent searches" /><div className="chip-row">{recentCities.map((city) => <button className="city-chip" key={`${city.name}-${city.country}`} onClick={() => getCityWeather(city.name)}><MapPin size={13} />{city.name}<span>{city.country}</span></button>)}</div></section>}

      <section className="support-section popular-section"><SectionHeading eyebrow="AROUND INDIA" title="Popular cities" trailing={popularStatus === 'loading' ? <span className="subtle-label"><LoaderCircle size={13} className="spin" /> UPDATING</span> : null} />{popularStatus === 'error' && <p className="support-message">Some city weather could not load. <button onClick={() => { popularCache.clear(); setPopular({}); setPopularStatus('loading'); setPopularRetry((value) => value + 1); }}>Retry</button></p>}<div className="popular-grid">{POPULAR_CITIES.map((city) => { const result = popular[city]; const item = result?.weather?.current; const info = item ? weatherInfo(item.weather_code) : null; const Icon = info?.Icon || CloudSun; return <button className="popular-card" key={city} onClick={() => getCityWeather(city)} disabled={!result?.weather} aria-label={result?.error ? `${city}, weather unavailable` : `${city}, ${item ? `${Math.round(item.temperature_2m)} degrees Celsius, ${info.label}` : 'weather loading'}`}><span className="popular-city"><MapPin size={13} />{city}</span>{result?.error ? <span className="popular-error">Unavailable</span> : item ? <><span className="popular-weather"><Icon size={24} /><strong>{Math.round(item.temperature_2m)}°C</strong></span><span className="popular-condition">{info.label}</span></> : <LoaderCircle size={17} className="spin popular-spinner" />}</button>; })}</div></section>

      <footer><div className="footer-brand"><span className="footer-mark"><CloudSun size={15} /></span> weatherly<span className="brand-period">.</span></div><span>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Location names by <a href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">OpenStreetMap</a>.</span></footer>
    </main>
  );
}

function SectionHeading({ eyebrow, title, icon: Icon, trailing }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{trailing || (Icon && <span className="heading-icon"><Icon size={19} /></span>)}</div>;
}

function Metric({ icon: Icon, label, value, tone }) {
  return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></div><div className="metric-copy"><span>{label}</span><strong>{value || '—'}</strong></div></div>;
}

function ForecastPlaceholder({ status }) {
  return <div className="forecast-empty">{status === 'error' ? 'Forecast unavailable. Retry your city search.' : <><LoaderCircle size={17} className="spin" /> Loading forecast…</>}</div>;
}

export default App;
