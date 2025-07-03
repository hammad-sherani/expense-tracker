'use client'
import React, { useState } from 'react'
import Logo, { LogoMobile } from './Logo'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from './ui/button'
import { dashboardLinks } from '@/constants/dashboard'
import { ThemeSwitcherBtn } from './ThemeSwitcherButton'
import { UserButton } from '@clerk/nextjs'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'
import { Menu } from 'lucide-react'

function Navbar() {
    return (
        <>
            <DesktopNavbar />
            <MobileNavbar />
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
                </div>
                <div className="flex items-center gap-2">
                    <ThemeSwitcherBtn />
                    <UserButton afterSignOutUrl="/sign-in" />
                </div>
            </nav>
        </div>
    )
}

function MobileNavbar() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className='block border-separate bg-background md:hidden'>
            <nav className="container flex items-center justify-between px-8">
                <Sheet open={isOpen} onOpenChange={setIsOpen} >
                    <SheetTrigger asChild>
                        <Button variant={'ghost'} size="icon" className="md:hidden">
                            <Menu />
                        </Button>
                    </SheetTrigger>
                    <SheetContent className='w-[400px] sm:w-[540px] ' side='left'>
                        <Logo />
                        <div className="flex flex-col gap-1 pt-4">
                            {dashboardLinks.map((item) => (
                                <NavbarItem
                                    key={item.label}
                                    label={item.label}
                                    link={item.link}
                                    onClick={() => setIsOpen(false)} />
                            ))}
                        </div>
                    </SheetContent>
                </Sheet>
                <div className="flex h-[80px] min-h-[60px] items-center gap-x-4">
                    <LogoMobile />
                </div>
                <div className="flex items-center gap-2">
                    <ThemeSwitcherBtn />
                    <UserButton afterSignOutUrl="/sign-in" />
                </div>
            </nav>
        </div>
    )
}


function NavbarItem({ label, link, onClick }: { label: string; link: string; onClick?: () => void }) {
    const pathName = usePathname();
    const isActive = pathName === link;
    return (
        <div className="relative flex items-center">
            <Link href={link} className={cn(
                buttonVariants({ variant: 'ghost' }),
                "w-full justify-start text-lg text-muted-foreground hover:text-foreground",
                isActive && "text-foreground font-semibold",
            )}
                onClick={onClick}
            >
                {label}
            </Link>

            {isActive && <div className="absolute bottom-0 left-0 h-[2px] w-full bg-foreground" />}
        </div>

    )
}


export default Navbar
