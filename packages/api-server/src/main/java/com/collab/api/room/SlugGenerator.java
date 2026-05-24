package com.collab.api.room;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Generates short, URL-safe alphanumeric slugs for rooms.
 *
 * <p>Slugs are 8 characters drawn from a 62-character alphabet
 * ({@code [a-zA-Z0-9]}), giving 62<sup>8</sup> ≈ 218 trillion combinations.
 * This makes collisions negligible at any realistic scale.
 *
 * <p>Uniqueness is enforced by the database ({@code UNIQUE} constraint on
 * {@code rooms.slug}). Callers should retry on a constraint violation if
 * uniqueness is required at the application layer.
 */
@Component
public class SlugGenerator {

    /** URL-safe alphabet: lowercase, uppercase, digits — no ambiguous characters. */
    private static final String ALPHABET =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    /** Length of generated slugs. 8 chars at base-62 gives 218 trillion combinations. */
    private static final int SLUG_LENGTH = 8;

    private final SecureRandom random = new SecureRandom();

    /**
     * Generates a random 8-character alphanumeric slug.
     *
     * @return A new random slug string of length {@link #SLUG_LENGTH}.
     */
    public String generate() {
        StringBuilder sb = new StringBuilder(SLUG_LENGTH);
        for (int i = 0; i < SLUG_LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
