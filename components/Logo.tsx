import { BadgeDollarSign } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

function Logo() {
  return (
    <Link href='/' className='flex items-center gap-2'>
      <BadgeDollarSign className='stroke h-11 w-11 stroke-amber-500 stroke-[1.5]' />
        <p className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent text-3xl font-bold">
            Expense Tracker
        </p>
    </Link>
  )
}


export function LogoMobile() {
  return (
    <Link href='/' className='flex items-center gap-2'>
        <p className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent sm:text-3xl text-2xl font-bold">
            Expense Tracker
        </p>
    </Link>
  )
}

export default Logo
