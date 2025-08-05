docker run --rm -v "$PWD":/build -w /build maven:3.9-eclipse-temurin-17 \
  mvn -q clean package

# Move the compiled JAR to the `out` directory
mv target/*.jar out/primary-role-mapper.jar
