import React, { useState, useCallback, useEffect, ChangeEvent } from "react";
import { FiClock, FiAlertCircle } from "react-icons/fi";

interface TimePickerProps {
  inlineLabel?: string;
  initialInterval?: string; // Format "HH:MM"
  onIntervalChange: (interval: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ 
  inlineLabel = "Time until start:",
  initialInterval = "01:00", 
  onIntervalChange 
}) => {
  const [hours, setHours] = useState<number>(1);
  const [minutes, setMinutes] = useState<number>(0);
  const [error, setError] = useState("");

  // Parse initialInterval to set initial state
  useEffect(() => {
    if (initialInterval) {
      const parts = initialInterval.split(':');
      if (parts.length === 2) { // Expect HH:MM
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) {
          setHours(h >= 0 && h <= 23 ? h : 1);
          setMinutes(m >= 0 && m <= 59 ? m : 0);
          return;
        }
      }
    }
    // Fallback to default if initialInterval is invalid or not provided correctly
    setHours(1);
    setMinutes(0);
  }, [initialInterval]);

  const handleValueChange = useCallback((type: 'hours' | 'minutes', value: string) => { 
    const numericValue = parseInt(value, 10);
    let currentHours = hours;
    let currentMinutes = minutes;
    let localError = "";

    if (isNaN(numericValue) || numericValue < 0) {
      // Allow empty input for typing, but treat as 0 for calculation if blurred or invalid
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
    }

    setError(localError);
    if (!localError) {
      const formattedInterval = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
      onIntervalChange(formattedInterval);
    }
  }, [hours, minutes, onIntervalChange]);

  // Helper to ensure value is string for input, even if state is number
  const getSafeValue = (val: number) => (isNaN(val) ? '' : String(val));

  return (
    <div className="w-full">
      <div className="space-y-2">
        <div className="flex items-center space-x-1">
          <FiClock className="text-gray-400 h-5 w-5" />
          <span className="text-sm font-medium text-gray-700">{inlineLabel}</span>
        </div>
        <div className="flex items-center space-x-3"> 
          <div className="flex-1 min-w-0 flex items-center space-x-2"> 
            <input
              id="interval-hours"
              type="number"
              min="0"
              max="23"
              value={getSafeValue(hours)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("hours", e.target.value)}
              onBlur={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("hours", e.target.value || '0')}
              className="input input-bordered input-sm w-16"
              placeholder="HH"
            />
            <span className="text-xs font-medium text-gray-500">Hours</span>
          </div>
          <div className="flex-1 min-w-0 flex items-center space-x-2"> 
            <input
              id="interval-minutes"
              type="number"
              min="0"
              max="59"
              step="1"
              value={getSafeValue(minutes)}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("minutes", e.target.value)}
              onBlur={(e: ChangeEvent<HTMLInputElement>) => handleValueChange("minutes", e.target.value || '0')}
              className="input input-bordered input-sm w-16"
              placeholder="MM"
            />
            <span className="text-xs font-medium text-gray-500">Minutes</span>
          </div>
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