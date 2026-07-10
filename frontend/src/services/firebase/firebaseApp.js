import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import FirebaseConfig from '@/configs/firebase.config'

const firebaseApp = initializeApp(FirebaseConfig)

const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID

export const auth = getAuth(firebaseApp)
export const db = databaseId
    ? getFirestore(firebaseApp, databaseId)
    : getFirestore(firebaseApp)

export default firebaseApp
