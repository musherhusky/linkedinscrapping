## ADDED Requirements

### Requirement: Batch-wide company/person URL deduplication is normalization-consistent
`processAllUsersBatched(hourUtc)` SHALL normalize company and person URLs (strip trailing slash, lowercase) before deduplicating them into the batch-wide `allCompanyUrls`/`allPeopleUrls` sets used to query Apify, using the same normalization already applied when matching posts back to individual users.

#### Scenario: Two users track the same company with differently-formatted URLs
- **WHEN** two users in the same batch have the same company registered as `https://www.linkedin.com/company/acme/` and `https://www.linkedin.com/company/acme` respectively
- **THEN** `allCompanyUrls` contains that company exactly once
- **AND** the Apify company actor is queried for it exactly once, not twice

#### Scenario: A user whose own registration is clean still doesn't receive duplicate posts
- **WHEN** a user has only one clean URL registered for a company that another user in the same batch registered with a different trailing-slash format
- **THEN** that user's `userCompanyPosts` contains each of that company's returned posts exactly once, not duplicated
