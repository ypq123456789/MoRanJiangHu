import React from 'react';

interface Props {
    accept?: string;
    onFileSelect: (file: File) => void;
    disabled?: boolean;
    children: React.ReactNode;
    className?: string;
}

const MobileFileUploader: React.FC<Props> = ({
    accept = '*',
    onFileSelect,
    disabled = false,
    children,
    className = ''
}) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleClick = () => {
        if (!disabled && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            onFileSelect(files[0]);
        }
        // 重置 input 以便可以选择同一文件
        event.target.value = '';
    };

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={disabled}
                className={className}
            >
                {children}
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileChange}
                className="hidden"
                aria-hidden="true"
            />
        </>
    );
};

export default MobileFileUploader;