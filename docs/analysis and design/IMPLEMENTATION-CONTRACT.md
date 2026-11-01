# Trozy implementation contract

Local full-stack app: React / TypeScript / Vite frontend and Node 24 HTTP API + node:sqlite backend. User implements B01–B05 independently. No AI/OCR model or provider dependency is included in core. Keep src/ai available for user code. M22 presents actual readings, usage and period comparisons; model-backed alerts and M23 AI replies attach via documented extension ports.

## API

All bodies/responses JSON, errors `{error: string}`, validation/auth/conflict statuses 400/401/403/404/409; payload/content-type/rate-limit statuses 413/415/429. Cookie sessions (HttpOnly, SameSite=Lax), same-origin mutation protection, password hashing with scrypt and token hashing. Server listens 127.0.0.1:3001 by default; serves dist when built. Vite serves 127.0.0.1:5173 and proxies /api. Uploaded files are the authenticated binary-response exception to JSON.

- GET /api/health
- POST /api/auth/login {email,password}; POST /api/auth/register {name,email,password,role,inviteCode?}; POST /api/auth/logout; GET /api/auth/me
- POST /api/auth/forgot-password {email}; POST /api/auth/reset-password {token,password}; POST /api/auth/verify-email {token}; POST /api/auth/resend-verification {}; PATCH /api/auth/profile {name?,phone?,avatarFileId?,notificationPreferences?}; POST /api/auth/change-password {currentPassword,password}
- GET /api/bootstrap → `{user:{id,name,email,role,tenantId?,phone?,verified?,avatarFileId?,notificationPreferences},data:{[collection]:Record[]},capabilities:{B01:boolean,...,B05:boolean}}`. Preferences use boolean keys `invoices`, `contracts`, `maintenance`, `general`.
- POST /api/:collection, PATCH /api/:collection/:id, DELETE /api/:collection/:id. All data scoped by session role/owner/tenant, validated server-side. Financial records immutable except defined actions. Entities include propertyId for scope filtering.
- POST /api/actions/:action. Response arbitrary JSON; frontend refreshes bootstrap after success.
- GET /api/export → scoped JSON data export. POST /api/import {collection,rows} for rooms/tenants; validation failure rolls back the entire batch. UI accepts .xlsx/CSV and up to 500 rows; API limit 1,000 rows.
- GET /api/files/:id; POST /api/files {name,type,data(base64),roomId?,tenantId?,propertyId?} → `{id,name,type,size}`. Authorized binary download only; `?inline=1` displays images. Each file ≤5 MB; JSON body ≤8 MB. Files remain associated with permitted records and cannot be attached across private tenant scopes.
- POST /api/extensions/B01 … /B05 → `{result}` or 501 when no provider is registered. See [AI-INTEGRATION.md](AI-INTEGRATION.md).

Collections: properties, rooms, tenants, contracts, readings, services, invoices, payments, credits, deposits, transactions, issues, assets, handovers, notifications, tickets, documents, vehicles, amenities, bookings, settings, audits. `credits` is derived and read-only; financial/audit collections are not directly mutable.

## Canonical fields

All IDs strings, all monetary amounts whole VND, dates ISO YYYY-MM-DD; period YYYY-MM. Each row id and ownerId. Optional createdAt/updatedAt.

- properties: name,address,contact,phone,floors,rules,archived
- rooms: propertyId,code,floor,area,capacity,price,status(vacant|occupied|maintenance|handover|archived),amenities,description,imageFileId?,imageFileIds? (at most 6 photos)
- tenants: propertyId,roomId?,name,email,phone,identityNumber?,moveInDate,moveOutDate?,status(active|left),members (string),userId?,inviteCode?
- contracts: propertyId,roomId,tenantId,startDate,endDate,rent,deposit,terms,status(draft|active|ended),version,acceptedAt?
- readings: propertyId,roomId,period,electricOld,electricNew,waterOld,waterNew,confirmed(boolean),photoFileId?
- services: propertyId,name,rate,unit(room|person|usage),active
- invoices: propertyId,roomId,tenantId,contractId,period,dueDate,rent,electricOld,electricNew,waterOld,waterNew,electricRate,waterRate,serviceItems?,serviceFee,adjustment,total,paid,status(draft|issued|cancelled),note,items,version,versions?,adjustmentHistory?; server-computed total/paid. serviceItems: `{serviceId?,name,quantity,rate,amount,unit?}`; server recalculates amounts and appends applicable parking fees without duplicating vehicle rows.
- payments: propertyId,invoiceId?,roomId,tenantId,kind(receipt|credit_apply|refund),amount,appliedAmount,creditAmount,creditSourceId?,refundSource?(invoice|credit),method(cash|transfer|credit),date,note. `amount` is unsigned event amount; `appliedAmount`/`creditAmount` have ledger signs. Legacy seeded receipt rows may omit those fields.
- credits (derived): id(origin receipt ID),propertyId,roomId,tenantId,invoiceId,amount(original overpayment),balance,date,createdAt. Tenant records also expose computed creditBalance.
- deposits: propertyId,contractId,roomId,tenantId,amount,type(receipt|deduction|refund),date,note
- transactions: propertyId,type(income|expense),category,amount,date,description,roomId?
- issues: propertyId,roomId,tenantId,assetId?,title,category,priority(low|normal|urgent),description,status(new|progress|resolved|closed),estimatedDate?,cost?,photoFileId?,resolutionFileId?,resolution?,rating?,history?,expenseId?
- assets: propertyId,roomId,name,code,status(good|repair|broken|retired),purchaseDate,warrantyDate,price,note,imageFileId?
- handovers: propertyId,roomId,tenantId,contractId,type(move_in|move_out),date,electricReading,waterReading,condition,assets,note,status(draft|confirmed),tenantAcceptedAt?,photoFileId?
- notifications: propertyId,roomId?,roomIds?(string[]),tenantId?,title,body,readBy(string[]),kind(general|invoice|contract|maintenance),automatic?,phase?. Multi-room recipients must belong to the chosen property. Tenant projection includes only the current user's read status.
- tickets: propertyId,roomId,tenantId,title,category,body,status(open|progress|resolved),messages([{id,authorId,authorName,body,createdAt,fileId?}]),fileId?
- documents: propertyId,roomId?,tenantId?,name,category(contract|receipt|rules|other),isTemplate(boolean),version,content,fileId?,visibility(all|tenant|landlord),versions?. Previous content/file/template metadata is retained for the landlord. Templates can be copied to a new document in UI.
- vehicles: propertyId,roomId,tenantId,plate,type,parkingSpot,fee,status(active|inactive)
- amenities: propertyId,name,description,capacity,active
- bookings: propertyId,amenityId,tenantId,date,startTime,endTime,status(confirmed|cancelled)
- settings: propertyId,electricRate,waterRate,billingDay,bankName,bankAccount,bankOwner,bankBin,invoiceNote,notificationDays,anomalyThreshold
- audits: id,actorId,actorName,action,collection,recordId,createdAt,detail

## Actions (canonical names and payloads)

- contract-activate {id}; contract-renew {id,endDate,rent?}; contract-end {id}; contract-accept {id}
- invoice-preview {roomId,period,dueDate?,rent?,electricOld,electricNew,waterOld,waterNew,electricRate,waterRate,serviceFee,adjustment,note?} → invoice calculation
- invoice-draft {id?,...invoiceFields} saves or updates an unpublished draft; invoice-issue same fields (or {id} for saved draft); invoice-adjust {id,reason,...invoiceFields} preserves paid allocation and snapshots the prior version; invoice-cancel {id,reason} requires paid=0.
- payment-record {invoiceId,amount,method,date,note}; applies up to outstanding balance and records extra as credit, creating only one actual receipt cashflow.
- payment-apply-credit {invoiceId,amount,creditId?,date?,note?}; same-tenant credit allocation only, with no new cashflow. Alias credit-apply.
- payment-refund {amount,invoiceId? OR creditId?/tenantId?,method?,date?,note}; refunds invoice allocation or remaining credit, creates an actual refund cashflow. Alias credit-refund accepts {id:creditId,...}. No refund can exceed the original allocation/remaining credit. Adjusting an invoice below paid requires refunding first.
- deposit-record {contractId,type,amount,date,note}; cannot deduct/refund beyond held balance
- issue-transition {id,status,resolution?,resolutionFileId?,cost?,estimatedDate?,rating?}. Only owner progresses/resolves; only linked tenant closes/rates. Posted repair cost is immutable; additional costs are separate cashbook expenses.
- handover-confirm {id}; notification-read {id}; ticket-reply {id,body,fileId?}; ticket-transition {id,status}
- invite-tenant {id} → {inviteCode}; booking-cancel {id}

## Persistence and recovery

SQLite stores users, sessions, auth tokens, local mail queue, file blobs and scoped records. Important mutations run inside transactions. Identity numbers are encrypted at rest with AES-256-GCM and masked on API responses; encryption key comes from `TROZY_DATA_KEY` (64 hexadecimal characters) or a locally generated `.trozy-data-key` beside the database. Do not lose that key when moving the database.

`GET /api/export` is a user-scoped JSON export and does not include authentication records, file blobs or encryption key. A local administrator can run `node src/backend/backup.mjs [new-destination-directory]` to take a full SQLite snapshot and preserve the local key. With external `TROZY_DATA_KEY`, preserve that environment secret separately. To recover, stop the app, copy database/key to a separate runtime directory, point `TROZY_DB_PATH` there and restart; keep the original backup unchanged. There is no public HTTP restore endpoint or automatic backup scheduler.

Auth email is always queued locally. Without SMTP configuration, inspect it using `node src/backend/outbox.mjs [email]`. Optional SMTP uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `TROZY_PUBLIC_URL`; deliveries persist sent/failed state without exposing tokens in HTTP responses. Real delivery needs the group's SMTP account and verification in that environment.

Invoice and contract reminders are deduplicated when `/api/bootstrap` runs. They use `settings.notificationDays` and preserve read status; paid/cancelled invoice reminders are removed. This is in-app reminder generation on access, not an unattended push/email scheduler.

Tenant access to shared/current-room data ends with checkout; explicitly authorized historical contracts, invoices and requests remain available. Completed handovers cannot be replayed to release a relet room. A future draft remains draft until the current exclusive tenancy completes checkout.

## Frontend modules

Reusable components in src/frontend/ui.tsx: PageHeader({title,description?,eyebrow?,actions?}), Badge({value,label?}), EmptyState({title,description?,action?}), Modal({title,children,onClose,wide?}), Field({label,name,type?,value?,defaultValue?,required?,children?,...inputProps}), DataTable({columns:[{key,label,render?}],rows,onRowClick?,empty?}), EntityPage({collection,title,description?,fields:FieldDefinition[],columns,defaults?,filter?,canCreate?,canEdit?,canDelete?,renderActions?,onSubmit?,children?}). FieldDefinition {name,label,type?:text|number|date|month|email|tel|textarea|select|checkbox,password?,required?,options?:{value,label}[],min?,step?,full?,defaultValue?}. EntityPage gets data/context automatically; provides search and create/edit modal; optional custom submit `(values,id?)=>Promise<any>`.

useApp exposes {user,data,propertyId,setPropertyId,page,navigate,refresh,notify,mutate(collection,values,id?),remove(collection,id),action(name,values),bootstrap}. API exported api(path,RequestInit), money,number,date,today,download. All action errors shown by caller. No alert/confirm dialogs; use Modal for confirmations. All strings Vietnamese. lucide-react icons available.

`App.tsx`, `ui.tsx`, `styles.css`, `main.tsx` provide shell, navigation, accessibility and reusable controls. `pages/Core.tsx` contains dashboard/rooms/readings/invoices/payments/reports/profile; `pages/Tenancy.tsx` covers properties/tenants/contracts/services/deposits/transactions/handovers/vehicles/amenities; `pages/Operations.tsx` covers issues/assets/notifications/tickets/documents/settings/insights. Backend domain/HTTP/persistence are separated under `src/backend/`. Tests cover business flows, permission boundaries, financial identities and recovery in `tests/`.
