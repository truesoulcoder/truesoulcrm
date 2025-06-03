import { Loader2 } from 'lucide-react';
import * as SimpleIcons from 'simple-icons';

export const Icons = {
  spinner: Loader2,
  google: () => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: '1em', height: '1em' }}
      dangerouslySetInnerHTML={{ __html: SimpleIcons.siGoogle.path }}
    />
  ),
  github: () => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: '1em', height: '1em' }}
      dangerouslySetInnerHTML={{ __html: SimpleIcons.siGithub.path }}
    />
  ),
};