import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
} from '@firebase/rules-unit-testing'

let testEnv

test.before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'rules-test-project',
        firestore: {
            rules: readFileSync('../firestore.rules', 'utf8'),
            host: 'localhost',
            port: 8080,
        },
    })
})

test.after(async () => {
    await testEnv.cleanup()
})

test.beforeEach(async () => {
    await testEnv.clearFirestore()
})

async function seed(setupFn) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setupFn(ctx.firestore())
    })
}

// ---- users/{uid} ----

test('signup can create own user doc as passenger or driver', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
        alice.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' }),
    )
})

test('signup cannot self-assign the admin role', async () => {
    const mallory = testEnv.authenticatedContext('mallory').firestore()
    await assertFails(
        mallory.collection('users').doc('mallory').set({ role: 'admin', name: 'Mallory' }),
    )
})

test('user cannot create a doc for someone else', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice.collection('users').doc('bob').set({ role: 'passenger', name: 'Bob' }),
    )
})

test('owner can update their own profile fields', async () => {
    await seed((db) => db.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' }))
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(alice.collection('users').doc('alice').update({ name: 'Alice Updated' }))
})

test('owner cannot escalate their own role via update', async () => {
    await seed((db) => db.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' }))
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(alice.collection('users').doc('alice').update({ role: 'admin' }))
})

test('owner cannot forge their own status or rating', async () => {
    await seed((db) => db.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' }))
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(alice.collection('users').doc('alice').update({ status: 'active' }))
    await assertFails(
        alice.collection('users').doc('alice').update({ rating: { avg: 5, count: 1 } }),
    )
})

test('admin can update any field on any user', async () => {
    await seed(async (db) => {
        await db.collection('users').doc('admin1').set({ role: 'admin' })
        await db.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' })
    })
    const admin = testEnv.authenticatedContext('admin1').firestore()
    await assertSucceeds(
        admin.collection('users').doc('alice').update({ role: 'driver', status: 'suspended' }),
    )
})

test('non-owner cannot read a user doc', async () => {
    await seed((db) => db.collection('users').doc('alice').set({ role: 'passenger', name: 'Alice' }))
    const bob = testEnv.authenticatedContext('bob').firestore()
    await assertFails(bob.collection('users').doc('alice').get())
})

// ---- driver_profiles/{uid} ----

test('any signed-in user can read a driver profile', async () => {
    await seed((db) =>
        db.collection('driver_profiles').doc('driver1').set({ onlineStatus: 'online' }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(alice.collection('driver_profiles').doc('driver1').get())
})

test('driver cannot write their own driver_profiles doc directly (backend-only)', async () => {
    await seed((db) =>
        db.collection('users').doc('driver1').set({ role: 'driver' }),
    )
    const driver1 = testEnv.authenticatedContext('driver1').firestore()
    await assertFails(
        driver1.collection('driver_profiles').doc('driver1').set({ onlineStatus: 'online' }),
    )
})

test('admin can write a driver_profiles doc', async () => {
    await seed((db) => db.collection('users').doc('admin1').set({ role: 'admin' }))
    const admin = testEnv.authenticatedContext('admin1').firestore()
    await assertSucceeds(
        admin.collection('driver_profiles').doc('driver1').set({ onlineStatus: 'online' }),
    )
})

// ---- rides/{rideId} ----

test('passenger cannot create a ride doc directly (backend-only)', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice.collection('rides').doc('ride1').set({ passengerId: 'alice', status: 'requested' }),
    )
})

test('passenger cannot forge their own ride to completed/free fare', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'in_progress',
            fareEstimate: 200,
        }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice.collection('rides').doc('ride1').update({ status: 'completed', finalFare: 0 }),
    )
})

test('participant can read their own ride; a stranger cannot', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    const driver1 = testEnv.authenticatedContext('driver1').firestore()
    const stranger = testEnv.authenticatedContext('stranger').firestore()

    await assertSucceeds(alice.collection('rides').doc('ride1').get())
    await assertSucceeds(driver1.collection('rides').doc('ride1').get())
    await assertFails(stranger.collection('rides').doc('ride1').get())
})

test('admin can create and update ride docs', async () => {
    await seed((db) => db.collection('users').doc('admin1').set({ role: 'admin' }))
    const admin = testEnv.authenticatedContext('admin1').firestore()
    await assertSucceeds(
        admin.collection('rides').doc('ride1').set({ passengerId: 'alice', status: 'requested' }),
    )
    await assertSucceeds(admin.collection('rides').doc('ride1').update({ status: 'cancelled' }))
})

// ---- rides/{rideId}/messages ----

test('ride participant can post a chat message with their own senderId', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
        alice
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .add({ senderId: 'alice', text: 'On my way' }),
    )
})

test('participant cannot post a message impersonating someone else', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .add({ senderId: 'driver1', text: 'Fake message' }),
    )
})

test('non-participant cannot read or post ride chat messages', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    const stranger = testEnv.authenticatedContext('stranger').firestore()
    await assertFails(
        stranger
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .add({ senderId: 'stranger', text: 'hi' }),
    )
    await assertFails(
        stranger.collection('rides').doc('ride1').collection('messages').get(),
    )
})

test('chat messages cannot be edited or deleted once sent', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    await seed((db) =>
        db
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .doc('msg1')
            .set({ senderId: 'alice', text: 'hi' }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .doc('msg1')
            .update({ text: 'edited' }),
    )
    await assertFails(
        alice.collection('rides').doc('ride1').collection('messages').doc('msg1').delete(),
    )
})

test('a message over 500 characters is rejected', async () => {
    await seed((db) =>
        db.collection('rides').doc('ride1').set({
            passengerId: 'alice',
            driverId: 'driver1',
            status: 'accepted',
        }),
    )
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
        alice
            .collection('rides')
            .doc('ride1')
            .collection('messages')
            .add({ senderId: 'alice', text: 'x'.repeat(501) }),
    )
})

// ---- ride_requests/{rideId} ----

test('a driver can read pending ride requests; a passenger cannot', async () => {
    await seed(async (db) => {
        await db.collection('users').doc('driver1').set({ role: 'driver' })
        await db.collection('users').doc('alice').set({ role: 'passenger' })
        await db.collection('ride_requests').doc('req1').set({ status: 'pending' })
    })
    const driver1 = testEnv.authenticatedContext('driver1').firestore()
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(driver1.collection('ride_requests').doc('req1').get())
    await assertFails(alice.collection('ride_requests').doc('req1').get())
})

test('a driver cannot write ride_requests directly (backend-only)', async () => {
    await seed((db) => db.collection('users').doc('driver1').set({ role: 'driver' }))
    const driver1 = testEnv.authenticatedContext('driver1').firestore()
    await assertFails(
        driver1.collection('ride_requests').doc('req1').update({ status: 'matched' }),
    )
})

// ---- fare_rules/{document} ----

test('any signed-in user can read fare rules; only admin can write them', async () => {
    await seed((db) => db.collection('fare_rules').doc('config').set({ baseFare: 40 }))
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(alice.collection('fare_rules').doc('config').get())
    await assertFails(alice.collection('fare_rules').doc('config').update({ baseFare: 0 }))
})

// ---- ratings/{rideId} ----

test('ratings are server-write-only but readable by any signed-in user', async () => {
    await seed((db) => db.collection('users').doc('admin1').set({ role: 'admin' }))
    const admin = testEnv.authenticatedContext('admin1').firestore()
    const alice = testEnv.authenticatedContext('alice').firestore()

    await assertSucceeds(
        admin.collection('ratings').doc('ride1').set({ by_passenger: { rating: 5 } }),
    )
    await assertFails(
        alice.collection('ratings').doc('ride1').set({ by_passenger: { rating: 1 } }),
    )
    await assertSucceeds(alice.collection('ratings').doc('ride1').get())
})

// ---- unauthenticated access ----

test('an unauthenticated client cannot read anything protected', async () => {
    await seed((db) => db.collection('rides').doc('ride1').set({ passengerId: 'alice', status: 'requested' }))
    const anon = testEnv.unauthenticatedContext().firestore()
    await assertFails(anon.collection('rides').doc('ride1').get())
    await assertFails(anon.collection('users').doc('alice').get())
})
