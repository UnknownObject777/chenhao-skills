# Synthetic cache-stampede postmortem evidence

This fixture is test input, not a record of a real production incident.

- A popular cache key expired.
- Origin QPS rose to 18 times its prior level.
- Latency alerts fired four minutes after the QPS rise.
- Request coalescing restored service.
- The event that caused the popular key to become simultaneously hot remains unproven.
