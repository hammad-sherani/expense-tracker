'use client'
import React from 'react'
import Logo from './Logo'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'
import { dashboardLinks } from '@/constants/dashboard'

function Navbar() {
    return (
        <>
            <DesktopNavbar />
        </>
    )
}


function DesktopNavbar() {
    return (
        <div className='hidden border-separate border-b bg-background md:block'>
            <nav className="container flex items-center justify-between px-8">
                <div className="flex h-[80px] min-h-[60px] items-center gap-x-4">
                    <Logo />
                    <div className="flex h-full items-center">
                        {dashboardLinks.map((item) => (
                            <NavbarItem key={item.label} label={item.label} link={item.link} />
                        ))}
                    </div>
                </div>
            </nav>

        </div>
    )
}


function NavbarItem({ label, link }: { label: string; link: string }) {
    const pathName = usePathname();
    const isActive = pathName === link;
    return (
        <div className="relative not-first-of-type:flex items-center">
            <Link href={link} className={cn(
                buttonVariants({ variant: 'ghost'}),
                "w-full justify-start text-lg text-muted-foreground hover:text-foreground",
                isActive && "text-foreground font-semibold",
            )} >
                {label}
            </Link>
        </div>

    )
}


export default Navbar
