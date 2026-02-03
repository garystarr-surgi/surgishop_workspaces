# SurgiShop Workspaces

Custom ERPNext workspaces for SurgiShop, including role-specific views for Sales Users and Sales Managers.

## Features

- **Sales Manager Workspace**: Comprehensive workspace with analytics, reports, and full selling module access for Sales Managers
- Public workspaces with proper role restrictions

## Installation

1. Get the app:
```bash
bench get-app https://github.com/yourusername/surgishop_workspaces.git
```

2. Install on your site:
```bash
bench --site yoursite.com install-app surgishop_workspaces
```

3. Run migrate:
```bash
bench --site yoursite.com migrate
```

## Workspaces Included

### Sales Manager
For users with Sales Manager role - includes:
- Sales Analytics
- Territory and Sales Person reports
- Customer management
- Full access to selling features

## License

MIT
