import React, { useState, useEffect } from 'react';

interface TypedHeaderProps {
    name: string;
}

const TypedHeader: React.FC<TypedHeaderProps> = ({ name }) => {
    const [part1, setPart1] = useState('');
    const [part2, setPart2] = useState('');
    const [showCursor1, setShowCursor1] = useState(true);
    const [showCursor2, setShowCursor2] = useState(false);

    const text1 = "Hi, I'm ";

    useEffect(() => {
        // Reset state when name changes
        setPart1('');
        setPart2('');
        setShowCursor1(true);
        setShowCursor2(false);

        const typeWithFunctionalUpdate = (
            text: string, 
            setter: React.Dispatch<React.SetStateAction<string>>, 
            onComplete: () => void
        ) => {
            const intervalId = setInterval(() => {
                setter(currentText => {
                    if (currentText.length < text.length) {
                        return text.slice(0, currentText.length + 1);
                    } else {
                        clearInterval(intervalId);
                        onComplete();
                        return currentText;
                    }
                });
            }, 80);
            return intervalId;
        };

        const intervalsToClear: ReturnType<typeof setTimeout>[] = [];

        const part1Interval = typeWithFunctionalUpdate(text1, setPart1, () => {
            setShowCursor1(false);
            setShowCursor2(true);
            
            const part2Interval = typeWithFunctionalUpdate(name, setPart2, () => {
                setShowCursor2(false);
            });
            
            intervalsToClear.push(part2Interval);
        });

        intervalsToClear.push(part1Interval);

        return () => {
            intervalsToClear.forEach(clearInterval);
        };
    }, [name]);

    return (
        <>
            {part1}
            {showCursor1 && <span className="typing-cursor">|</span>}
            <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-red-500 dark:to-rose-500 ml-3">
                {part2}
                {showCursor2 && <span className="typing-cursor text-cyan-500 dark:text-red-500">|</span>}
            </span>
        </>
    );
};

export default TypedHeader;