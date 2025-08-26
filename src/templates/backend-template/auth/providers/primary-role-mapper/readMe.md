# Keycloak Custom Extensions

## Description

This directory contains custom Keycloak extensions and configurations.

## Primary Role Mapper Extension

### Overview
The `primary-role-mapper` is a custom Keycloak extension that provides primary role mapping functionality.

### Building the Maven Project

#### Prerequisites
- Docker installed on your system
- Maven project files in `primary-role-mapper/` directory

#### Building with Docker (Recommended)

The project includes a convenient shell script that uses a temporary Maven Docker container to build the project:

```bash
# Navigate to the primary-role-mapper directory
cd services/keycloak/primary-role-mapper

# Run the Maven build using Docker
./maven-compile.sh
```

#### Manual Docker Build

If you prefer to run the Docker command manually:

```bash
# From the primary-role-mapper directory
docker run --rm -v "$PWD":/build -w /build maven:3.9-eclipse-temurin-17 \
  mvn -q clean package
```

#### Build Output

After successful build:
- Compiled JAR file will be in `target/` directory
- The JAR file will be named `primary-role-mapper-1.0.0.jar`

### Deployment

1. Copy the built JAR file to your Keycloak `providers/` directory
2. Restart Keycloak server
3. The extension will be available in the Keycloak admin console

### Project Structure

```
primary-role-mapper/
├── pom.xml                 # Maven project configuration
├── maven-compile.sh        # Build script using Docker
├── src/
│   └── main/
│       └── resources/
│           ├── META-INF/
│           │   └── keycloak-scripts.json
│           └── primary-role.js
└── target/                 # Build output directory
```
