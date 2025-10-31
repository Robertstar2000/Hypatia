import Dexie, { type Table } from 'dexie';
import { Experiment } from './config';

// --- DATABASE SETUP (DEXIE) ---
// This class defines the structure of the local IndexedDB database.
class ExperimentDatabase extends Dexie {
    // Defines a 'table' called 'experiments' that will store Experiment objects, indexed by their string 'id'.
    experiments!: Table<Experiment, string>;

    constructor() {
        super("ProjectHypatiaDB");
        (this as Dexie).version(2).stores({
            // Schema definition: 'id' is the primary key. 'title' and 'createdAt' are indexed for faster lookups.
            experiments: 'id, title, createdAt'
        });
    }
}

// A singleton instance of the database, exported for use throughout the application.
export const db = new ExperimentDatabase();