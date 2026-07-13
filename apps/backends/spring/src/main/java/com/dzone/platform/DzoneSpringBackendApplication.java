package com.dzone.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DzoneSpringBackendApplication {
  public static void main(String[] args) {
    SpringApplication.run(DzoneSpringBackendApplication.class, args);
  }
}
