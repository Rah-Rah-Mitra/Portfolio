
import React from 'react';

interface FooterProps {
  name: string;
}

const Footer: React.FC<FooterProps> = ({ name }) => {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-gray-800 text-center py-8 border-t border-gray-700">
      <p className="text-gray-400 text-sm">
        &copy; {currentYear} {name}. All rights reserved.
      </p>
      <p className="text-gray-500 text-xs mt-1">
        Crafted with <span className="text-red-500">❤️</span> using React & Tailwind CSS.
      </p>
    </footer>
  );
};

export default Footer;
    