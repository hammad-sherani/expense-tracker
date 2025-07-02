'use client'
import React from 'react'
import Logo from './Logo'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'
import { dashboardLinks } from '@/constants/dashboard'
import ThemeSwitcherButton from './ThemeSwitcherButton'

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
                    <div className="flex h-full ">
                        {dashboardLinks.map((item) => (
                            <NavbarItem key={item.label} label={item.label} link={item.link} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeSwitcherButton />
                        {/* <UserButton afterSignOutUrl="/sign-in" /> */}
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
        <div className="relative flex items-center">
            <Link href={link} className={cn(
                buttonVariants({ variant: 'ghost'}),
                "w-full justify-start text-lg text-muted-foreground hover:text-foreground",
                isActive && "text-foreground font-semibold",
            )} >
                {label}
            </Link>

            {isActive && <div className="absolute bottom-0 left-0 h-[2px] w-full bg-foreground" />}
        </div>

    )
}


export default Navbar
