// src/once-ui/icons/index.ts
import { IconType } from 'react-icons';
import { FaUser, FaCog, FaHome, FaEnvelope, FaChartBar, FaEdit, FaTrash, FaPlay, FaPause, FaExclamationTriangle, FaTimes, FaPlus, FaUsers } from 'react-icons/fa'; // Using Font Awesome examples

// Define the names of the icons you want to use
export type IconName =
  | 'user'
  | 'settings'
  | 'home'
  | 'email' // Corresponds to Mail
  | 'stats' // Corresponds to BarChart2
  | 'edit' // Corresponds to Edit3
  | 'delete' // Corresponds to Trash2
  | 'play' // Corresponds to PlayCircle
  | 'pause' // Corresponds to PauseCircle
  | 'warning' // Corresponds to AlertTriangle
  | 'close' // Corresponds to X
  | 'addUser' // Corresponds to UserPlus
  | 'group' // Corresponds to UsersIcon
  | 'person'; // For the empty avatar

// Map the icon names to the actual icon components
export const iconLibrary: Record<IconName, IconType> = {
  user: FaUser,
  settings: FaCog,
  home: FaHome,
  email: FaEnvelope,
  stats: FaChartBar,
  edit: FaEdit,
  delete: FaTrash,
  play: FaPlay,
  pause: FaPause,
  warning: FaExclamationTriangle,
  close: FaTimes,
  addUser: FaPlus, // FaPlus is a common plus icon
  group: FaUsers,
  person: FaUser, // Using FaUser for the generic person icon
};
