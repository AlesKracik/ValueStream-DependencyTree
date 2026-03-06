import { MongoClient } from 'mongodb';

const uri = "mongodb://localhost:27017";
const dbName = "valueStream";

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('customers');

        const updates = [
            {
                id: "c1",
                support_issues: [
                    {
                        id: "si1",
                        description: "Slow performance on dashboard",
                        status: "work in progress",
                        created_at: "2026-02-15T10:00:00Z",
                        updated_at: "2026-03-01T14:30:00Z",
                        related_jiras: ["SUP-101"]
                    }
                ],
                jira_support_issues: [
                    {
                        key: "SUP-101",
                        summary: "Optimize dashboard query execution",
                        status: "In Progress",
                        priority: "High",
                        url: "https://jira.example.com/browse/SUP-101",
                        last_updated: "2026-03-05T09:00:00Z",
                        category: "in_progress"
                    },
                    {
                        key: "SUP-102",
                        summary: "Add more logging for data ingestion",
                        status: "New",
                        priority: "Medium",
                        url: "https://jira.example.com/browse/SUP-102",
                        last_updated: "2026-03-06T11:00:00Z",
                        category: "new"
                    }
                ]
            },
            {
                id: "c2",
                support_issues: [
                    {
                        id: "si2",
                        description: "Integration with Auth0 failing occasionally",
                        status: "waiting for other party",
                        created_at: "2026-02-20T08:15:00Z",
                        updated_at: "2026-03-04T16:45:00Z",
                        related_jiras: ["SUP-201"]
                    }
                ],
                jira_support_issues: [
                    {
                        key: "SUP-201",
                        summary: "Intermittent 401 errors during token refresh",
                        status: "Open",
                        priority: "Critical",
                        url: "https://jira.example.com/browse/SUP-201",
                        last_updated: "2026-03-04T16:00:00Z",
                        category: "new"
                    }
                ]
            },
            {
                id: "c3",
                jira_support_issues: [
                    {
                        key: "SUP-301",
                        summary: "Request for custom reporting fields",
                        status: "Resolved",
                        priority: "Low",
                        url: "https://jira.example.com/browse/SUP-301",
                        last_updated: "2026-02-28T13:20:00Z",
                        category: "noop"
                    }
                ]
            }
        ];

        for (const update of updates) {
            const result = await collection.updateOne(
                { id: update.id },
                { $set: { 
                    support_issues: update.support_issues || [],
                    jira_support_issues: update.jira_support_issues || []
                } }
            );
            console.log(`Updated customer ${update.id}: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
