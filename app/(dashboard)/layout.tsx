import Navbar from '@/components/Navbar'
import React from 'react'

function layout({ children }: { children: React.ReactNode }) {
    return (
        <div className='relative h-screen flex flex-col'>
            <Navbar />
            <div className="w-full">
                {children}
            </div>
        </div>
    )
}

export default layout
