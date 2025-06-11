import React, { useMemo } from "react";
import { TimeInput as HeroTimeInput, type TimeValue } from '@heroui/react'; // Assuming TimeValue is exported type for Time object
import { Time } from '@internationalized/date';
import { Clock } from 'lucide-react'; // Using lucide-react for consistency

interface TimePickerProps {
  inlineLabel?: string;
  initialInterval?: string; // Format "HH:MM"
  onIntervalChange: (interval: string) => void;
  isDisabled?: boolean; // Added isDisabled prop
  className?: string; // Allow passing custom className
}

const TimePicker: React.FC<TimePickerProps> = ({ 
  inlineLabel = "Time until start:",
  initialInterval = "01:00", 
  onIntervalChange,
  isDisabled = false,
  className = "",
}) => {

  const defaultTimeValue = useMemo(() => {
    if (initialInterval) {
      const parts = initialInterval.split(':');
      if (parts.length === 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        // Basic validation for hours and minutes
        if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          return new Time(h, m);
        }
      }
    }
    // Fallback to a default Time if initialInterval is invalid or not provided
    return new Time(1, 0); 
  }, [initialInterval]);

  const handleTimeChange = (timeValue: TimeValue | null) => {
    // Assuming TimeValue from HeroUI is compatible with @internationalized/date Time, or is the Time object itself.
    // If timeValue can be null (e.g., if input is cleared), decide on behavior.
    // For now, we'll only call onIntervalChange if timeValue is valid.
    if (timeValue && typeof timeValue.hour === 'number' && typeof timeValue.minute === 'number') {
      const formattedInterval = `${String(timeValue.hour).padStart(2, '0')}:${String(timeValue.minute).padStart(2, '0')}`;
      onIntervalChange(formattedInterval);
    }
    // Optional: handle case where timeValue is null, e.g., call onIntervalChange with an empty string or a default.
    // else {
    //   onIntervalChange(""); // Or some default invalid state representation
    // }
  };

  return (
    <div className={`w-full ${className}`}>
      <HeroTimeInput
        label={inlineLabel}
        defaultValue={defaultTimeValue}
        onChange={handleTimeChange}
        isDisabled={isDisabled}
        // Optional: Add icon. HeroUI TimeInput might have specific props for icons.
        // startContent={<Clock size={18} className="text-gray-400" />} 
        // Or it might be hourCycle, granularity, etc.
        // For now, keeping it simple.
        // size="sm" // If HeroUI TimeInput supports a size prop
        // HeroUI TimeInput should handle its own error display based on its validation.
        // If custom error messages are needed, it would likely be via an `errorMessage` prop.
      />
    </div>
  );
};

export default TimePicker;