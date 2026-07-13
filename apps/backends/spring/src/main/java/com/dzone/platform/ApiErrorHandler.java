package com.dzone.platform;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, String>> handleApiException(ApiException error) {
    return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> handleUnexpected(Exception error) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
      .body(Map.of("error", "Internal server error."));
  }
}

