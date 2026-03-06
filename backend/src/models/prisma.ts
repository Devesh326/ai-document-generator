import dotenv from 'dotenv';

import { PrismaClient } from '@prisma/client';

dotenv.config();

export const prisma = new PrismaClient({datasourceUrl: process.env.DATABASE_URL});

prisma.$connect()
  .then(() => {
    console.log('✅ Connected to database');  
    })
    .catch((err) => {
        console.error('❌ Database connection error:', err);
        process.exit(1);
    });


export default prisma;  