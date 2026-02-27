import React, { useState, useRef, useEffect } from 'react';

interface Option {
    id: string;
    label: string;
}

interface SearchableDropdownProps {
    options: Option[];
    onSelect: (id: string) => void;
    placeholder: string;
    clearOnSelect?: boolean;
    initialValue?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({ 
    options, 
    onSelect, 
    placeholder,
    clearOnSelect = true,
    initialValue = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(initialValue);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync searchTerm with initialValue when it changes (e.g. for table rows)
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm(initialValue);
        }
    }, [initialValue, isOpen]);

    const filteredOptions = options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id: string) => {
        onSelect(id);
        if (clearOnSelect) {
            setSearchTerm('');
        }
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#374151',
                    color: '#fff',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    fontSize: '14px'
                }}
            />
            {isOpen && filteredOptions.length > 0 && (
                <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    backgroundColor: '#1f2937',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    marginTop: '4px',
                    padding: 0,
                    listStyle: 'none',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                }}>
                    {filteredOptions.map(option => (
                        <li
                            key={option.id}
                            onClick={() => handleSelect(option.id)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                color: '#e5e7eb',
                                fontSize: '14px',
                                borderBottom: '1px solid #374151'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#374151')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            {option.label}
                        </li>
                    ))}
                </ul>
            )}
            {isOpen && searchTerm && filteredOptions.length === 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    backgroundColor: '#1f2937',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    marginTop: '4px',
                    padding: '8px 12px',
                    color: '#9ca3af',
                    fontSize: '14px'
                }}>
                    No options found
                </div>
            )}
        </div>
    );
};
