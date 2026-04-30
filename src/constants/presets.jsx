import { Camera, CirclePlay, Monitor, Printer } from 'lucide-react';

export const INITIAL_CUSTOM_PRESETS = [
  { id: 'c1', name: 'Instagram 5by5', w: 933, h: 933 },
  { id: 'c2', name: 'temp', w: 234, h: 234 },
  { id: 'c3', name: 'TMH Size', w: 2163, h: 2685 },
];

export const STATIC_PRESETS = [
  {
    category: 'YouTube',
    icon: <CirclePlay size={16} />,
    items: [
      { name: 'Video HD', w: 1920, h: 1080 },
      { name: 'Thumbnail', w: 1280, h: 720 },
      { name: 'Banner', w: 2048, h: 1152 },
      { name: 'Profile', w: 98, h: 98 },
      { name: 'Shorts', w: 1080, h: 1920 },
    ],
  },
  {
    category: 'Social',
    icon: <Camera size={16} />,
    items: [
      { name: 'IG Post', w: 1080, h: 1080 },
      { name: 'IG Portrait', w: 1080, h: 1350 },
      { name: 'Square', w: 1080, h: 1080 },
    ],
  },
  {
    category: 'Ads',
    icon: <Monitor size={16} />,
    items: [
      { name: 'Rectangle', w: 300, h: 250 },
      { name: 'Leaderboard', w: 728, h: 90 },
      { name: 'Half Page', w: 300, h: 600 },
      { name: 'Banner', w: 320, h: 100 },
    ],
  },
  {
    category: 'Print',
    icon: <Printer size={16} />,
    items: [
      { name: 'A4', w: 2480, h: 3508 },
      { name: 'A3', w: 3508, h: 4961 },
      { name: 'Letter', w: 2550, h: 3300 },
      { name: 'Ledger', w: 3300, h: 5100 },
    ],
  },
];
