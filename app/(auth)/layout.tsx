import Logo from '../../components/Logo'
import React, { ReactNode } from 'react'

function layout({ children } : { children: ReactNode }) {
  return (
    <div className='relative h-screen w-full flex flex-col items-center justify-center'>
        <Logo />
      <div className='mt-12'>
        {children}
      </div>
    </div>
  )
}

export default layout
