import React, { useState, useCallback, useEffect, ChangeEvent } from "react";
import { FiClock, FiAlertCircle } from "react-icons/fi";

interface TimePickerProps {
  label?: string;
  initialInterval?: string; // Format "HH:MM:SS"
  onIntervalChange: (interval: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ 
  label,
  initialInterval = "01:00:00", // Default initial interval
  onIntervalChange 
}) => {
  const [hours, setHours] = useState<number>(1);
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [error, setError] = useState("");

  // Parse initialInterval to set initial state
  useEffect(() => {
    if (initialInterval) {
      const parts = initialInterval.split(':');
      if (parts.length === 3) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10);
        if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
          setHours(h >= 0 && h <= 23 ? h : 1); // Max 23 hours for HH:MM:SS format, default 1
          setMinutes(m >= 0 && m <= 59 ? m : 0);
          setSeconds(s >= 0 && s <= 59 ? s : 0);
          return;
        }
      }
    }
    // Fallback to default if initialInterval is invalid or not provided correctly
    setHours(1);
    setMinutes(0);
    setSeconds(0);
  }, [initialInterval]);

  const handleValueChange = useCallback((type: 'hours' | 'minutes' | 'seconds', value: string) => {
    const numericValue = parseInt(value, 10);
    let currentHours = hours;
    let currentMinutes = minutes;
    let currentSeconds = seconds;
    let localError = "";

    if (isNaN(numericValue) || numericValue < 0) {
      // Allow empty input for typing, but treat as 0 for calculation if blurred or invalid
      // Or set an error if strict validation is needed immediately
    }

    switch (type) {
      case 'hours':
        if (numericValue > 23) localError = "Hours can't exceed 23.";
        currentHours = isNaN(numericValue) ? 0 : Math.min(Math.max(0, numericValue), 23);
        setHours(currentHours);
        break;
      case 'minutes':
        if (numericValue > 59) localError = "Minutes can't exceed 59.";
        currentMinutes = isNaN(numericValue) ? 0 : Math.min(Math.max(0, numericValue), 59);
        setMinutes(currentMinutes);
        break;
      case 'seconds':
        if (numericValue > 59) localError = "Seconds can't exceed 59.";
        currentSeconds = isNaN(numericValue) ? 0 : Math.min(Math.max(0, numericValue), 59);
        setSeconds(currentSeconds);
        break;
    }

    setError(localError);
    if (!localError) {
      const formattedInterval = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}:${String(currentSeconds).padStart(2, '0')}`;
      onIntervalChange(formattedInterval);
    }
  }, [hours, minutes, seconds, onIntervalChange]);

  // Helper to ensure value is string for input, even if state is number
  const getSafeValue = (val: number) => (isNaN(val) ? '' : String(val));

  // Preset durations for quick selection - these will call onIntervalChange
  const presetIntervals = [
    { label: "30min", interval: "00:30:00" },
    { label: "1h", interval: "01:00:00" },
    { label: "2h", interval: "02:00:00" },
    { label: "6h", interval: "06:00:00" },
    { label: "12h", interval: "12:00:00" },
    { label: "24h", interval: "24:00:00" }, // Note: PostgreSQL interval '24 hours' is fine, HH:MM:SS max is 23:59:59 for time part
                                         // For simplicity, we'll cap hours at 23 in inputs, but '24:00:00' can be a preset.
                                         // Or, we can make presets like '1 day' if PostgreSQL interval type is flexible.
                                         // For now, sticking to HH:MM:SS for presets too.
  ];

  const handlePresetClick = (interval: string) => {
    const parts = interval.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    setHours(h);
    setMinutes(m);
    setSeconds(s);
    onIntervalChange(interval);
    setError("");
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-base-100 rounded-xl shadow-lg">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <FiClock className="text-gray-400 h-5 w-5" />
          <span className="text-sm font-medium text-gray-700">Set Interval:</span>
        </div>
        <div className="flex space-x-2">
          <div className="flex-1">
            <label htmlFor="interval-hours" className="block text-xs font-medium text-gray-500">Hours</label>
            <input
              id="interval-hours"
              type="number"
              min="0"
              max="23" // Max 23 for HH:MM:SS format
              value={getSafeValue(hours)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("hours", e.target.value)}
              onBlur={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("hours", e.target.value || '0')} // Ensure a value on blur
              className="input input-bordered input-sm w-full"
              placeholder="HH"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="interval-minutes" className="block text-xs font-medium text-gray-500">Minutes</label>
            <input
              id="interval-minutes"
              type="number"
              min="0"
              max="59"
              step="1"
              value={getSafeValue(minutes)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("minutes", e.target.value)}
              onBlur={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("minutes", e.target.value || '0')}
              className="input input-bordered input-sm w-full"
              placeholder="MM"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="interval-seconds" className="block text-xs font-medium text-gray-500">Seconds</label>
            <input
              id="interval-seconds"
              type="number"
              min="0"
              max="59"
              step="1"
              value={getSafeValue(seconds)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("seconds", e.target.value)}
              onBlur={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("seconds", e.target.value || '0')}
              className="input input-bordered input-sm w-full"
              placeholder="SS"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {presetIntervals.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.interval)}
              className="btn btn-xs btn-outline"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center text-red-600 text-sm mt-2">
            <FiAlertCircle className="mr-2 h-4 w-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimePicker;