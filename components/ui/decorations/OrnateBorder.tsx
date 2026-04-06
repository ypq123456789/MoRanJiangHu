import React from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

// A highly stylized container with ornate corners and borders, inspired by traditional Chinese art.
export const OrnateBorder: React.FC<Props> = ({ children, className, ...props }) => {
    return (
        <div className={`relative border border-wuxia-gold/30 bg-black/30 p-6 rounded-lg ${className}`} {...props}>
            {/* Corner decorations - Top-left */}
            <div className="absolute -top-1 -left-1 w-16 h-16 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2,50 C2,23.49 23.49,2 50,2" stroke="rgba(230,200,110,0.6)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M2,30 C2,14.43 14.43,2 30,2" stroke="rgba(230,200,110,0.4)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15,2 L2,2 L2,15" stroke="rgba(230,200,110,0.8)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>

            {/* Corner decorations - Top-right (flipped) */}
            <div className="absolute -top-1 -right-1 w-16 h-16 pointer-events-none transform scale-x-[-1]">
                <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2,50 C2,23.49 23.49,2 50,2" stroke="rgba(230,200,110,0.6)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M2,30 C2,14.43 14.43,2 30,2" stroke="rgba(230,200,110,0.4)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15,2 L2,2 L2,15" stroke="rgba(230,200,110,0.8)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
            
            {/* Corner decorations - Bottom-left (flipped) */}
            <div className="absolute -bottom-1 -left-1 w-16 h-16 pointer-events-none transform scale-y-[-1]">
                 <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2,50 C2,23.49 23.49,2 50,2" stroke="rgba(230,200,110,0.6)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M2,30 C2,14.43 14.43,2 30,2" stroke="rgba(230,200,110,0.4)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15,2 L2,2 L2,15" stroke="rgba(230,200,110,0.8)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>

            {/* Corner decorations - Bottom-right (flipped) */}
            <div className="absolute -bottom-1 -right-1 w-16 h-16 pointer-events-none transform scale-x-[-1] scale-y-[-1]">
                 <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2,50 C2,23.49 23.49,2 50,2" stroke="rgba(230,200,110,0.6)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M2,30 C2,14.43 14.43,2 30,2" stroke="rgba(230,200,110,0.4)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M15,2 L2,2 L2,15" stroke="rgba(230,200,110,0.8)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>

            {/* Propitious Cloud Decoration */}
            <div className="absolute top-4 right-4 w-24 h-16 opacity-10 pointer-events-none">
                <svg viewBox="0 0 120 60" fill="currentColor" className="text-wuxia-gold"><path d="M81.54,23.15c-1.2-1.8-3.6-2.4-5.4-1.2s-2.4,3.6-1.2,5.4c3.2,4.8,2,10.8-2.8,14s-10.8,2-14-2.8c-2.95-4.43-1.94-10.2,2.49-13.15C65,23,68.2,21.9,71,23.1c1.8-1.2,2.4-3.6,1.2-5.4c-1.2-1.8-3.6-2.4-5.4-1.2c-5.2,3.5-7.5,10.3-4.1,15.5c4.7,7.1,13.8,8.4,20.9,3.7C90.74,31.05,89.54,26.15,81.54,23.15z"></path><path d="M68,16.5C64.6,12.3,58.7,11,53.2,13.2c-1.7-1.4-4.2-0.9-5.6,0.8c-1.4,1.7-0.9,4.2,0.8,5.6c4.6,3.9,6.5,10,4.2,15.5c-3.1,7.2-11.2,10.5-18.4,7.4c-0.8-0.3-1.6-0.7-2.4-1.1c-1.6-0.9-3.6-0.2-4.5,1.4s-0.2,3.6,1.4,4.5c1.1,0.6,2.2,1.2,3.3,1.7c9.9,4.4,21.5,0,25.9-9.9C73.2,28.5,72.4,21.9,68,16.5z"></path><path d="M103.8,13.4c-3.9-3.9-10.1-4.5-14.7-1.5c-1.8-1.2-4.2-0.6-5.4,1.2s-0.6,4.2,1.2,5.4c3.1,2.1,4.4,6.1,3.2,9.6c-1.6,4.8-6.1,7.7-10.9,7.1c-0.2,0-0.3,0-0.5,0c-1.9,0-3.6-1.3-4-3.2c-0.5-2.2,0.9-4.4,3-4.9c1.5-0.3,2.9,0.3,3.8,1.4c1.2,1.4,3.4,1.6,4.8,0.4c1.4-1.2,1.6-3.4,0.4-4.8c-2.3-2.6-5.8-3.7-9.2-2.9c-4.9,1.1-8.2,5.6-7.1,10.5c1.4,6.1,7.2,10.1,13.3,9.2c0.2,0,0.5,0,0.7,0c7.8-0.8,14.2-6.5,15.4-14.2C108.3,23.3,107.1,16.7,103.8,13.4z"></path></svg>
            </div>

            {children}
        </div>
    );
};
