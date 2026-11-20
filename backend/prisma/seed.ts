import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

// Idempotent sample data. Both accounts use the password "password123" (development only!).
await prisma.todo.deleteMany();
await prisma.user.deleteMany();

const passwordHash = await hashPassword("password123");
const alice = await prisma.user.create({
  data: { email: "alice@example.com", name: "Alice", passwordHash },
});
await prisma.user.create({
  data: { email: "admin@example.com", name: "Admin", passwordHash, role: "ADMIN" },
});
await prisma.todo.createMany({
  data: [
    { title: "Read the README", userId: alice.id },
    { title: "Add your first feature", completed: true, userId: alice.id },
  ],
});

console.warn("Seeded: alice@example.com / admin@example.com (password: password123)");
await prisma.$disconnect();
