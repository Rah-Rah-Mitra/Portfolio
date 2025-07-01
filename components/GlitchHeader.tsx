import React from 'react';

interface GlitchHeaderProps {
    name: string;
}

const GlitchHeader: React.FC<GlitchHeaderProps> = ({ name }) => {
    return (
        <>
            <span className="glitch-intro">Hi, I'm </span>
            <span className="glitch ml-3" data-text={name}>
                {name}
            </span>
        </>
    );
};

export default GlitchHeader;