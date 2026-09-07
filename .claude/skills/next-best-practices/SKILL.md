---
name: next-best-practices
description: Core architectural standards, file conventions, and asynchronous/data patterns for Next.js 15+ App Router and Supabase development.
---

# Next.js Best Practices & Scaffolding Standards

You are a senior Next.js architect and tech lead. When designing, scaffolding, or writing any backend or frontend code using the Next.js App Router (version 15+) and Supabase, enforce these standards.

## 1. Domain-Centric Architecture & Routing
* **Split Work by Domain:** Group pages, components, and logic by domain entity using Next.js App Router conventions.
* **Route Groups:** Use parenthesis-wrapped folders `(folderName)` to group related domains without altering the URL path.
  ```text
  app/
  ├── (admin)/
  ├── (donor)/
  │   ├── screening/
  │   │   └── page.tsx      # URL: /screening
  │   └── _components/      # Private components colocated within donor domain
  └── (inventory)/
  ```
* **Private Folders:** Prefix internal folders with an underscore `_` (e.g., `_components`, `_lib`, `_actions`) to keep internal logic strictly colocated within their domain route groups. Avoid a bloated global `src/components` folder.
* **API Route Conflicts:** Never place a `route.ts` (API endpoint) and a `page.tsx` (UI) in the exact same directory.

## 2. Next.js 15+ Async Dynamic APIs
* **Dynamic Route Parameters:** `params` and `searchParams` props are `Promise` objects. You must explicitly `await` them before reading properties.
  ```tsx
  type Props = { params: Promise<{ id: string }> };

  export default async function Page({ params }: Props) {
    const { id } = await params;
    // ...
  }
  ```
* **Headers & Cookies:** `cookies()` and `headers()` from `next/headers` are asynchronous and must be awaited.
  ```tsx
  import { cookies, headers } from 'next/headers';
  
  export async function Action() {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    // ...
  }
  ```

## 3. Server-First Data Patterns
* **Default to Server Components:** Fetch data directly inside Server Components by default to minimize client-side bundle size, reduce latency, and improve performance.
* **Concurrent Fetching (Prevent Waterfalls):** When fetching independent datasets, fire queries concurrently with `Promise.all` instead of awaiting them sequentially.
  ```tsx
  // GOOD: Fetched concurrently
  const [donorProfile, labResults] = await Promise.all([
    getDonorProfile(id),
    getLabResults(id)
  ]);
  ```

## 4. Route Handlers vs. Server Actions
* **The Golden Rule:** Use **Server Actions** for interactions triggered by your own UI. Use **Route Handlers** for interactions triggered by external services, APIs, or webhooks.
* **Colocation:** Colocate Server Actions inside private folders (e.g., `_actions`) directly within the domain route group. Avoid placing them in a centralized global directory unless shared across multiple domains.

### Implementation Matrix

| Use Case | Implementation Type | Example |
| :--- | :--- | :--- |
| **Form Submissions** | Server Action | Registering a new donor, logging pasteurization batches |
| **UI Data Mutations** | Server Action | Updating a milk batch's status to "Dispensed" or "Discarded" |
| **Third-Party Webhooks** | Route Handler (`route.ts`) | Lab system pushing test results to `/api/webhooks/lab` |
| **Public REST API** | Route Handler (`route.ts`) | Exposing inventory levels to a partner hospital's IT system |
