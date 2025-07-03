import { describe, test, expect, jest } from "@jest/globals";
import { Result } from "./result";

describe("Result", () => {
  let mockExit: ReturnType<typeof jest.spyOn>;
  let mockConsoleError: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Mock process.exit to prevent test runner from exiting
    mockExit = jest.spyOn(process, "exit").mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit called with "${code}"`);
    }) as any);
    mockConsoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe("Ok", () => {
    test("should create an Ok result with value", () => {
      const result = Result.Ok("success");
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe("success");
    });

    test("should handle different types of values", () => {
      const numberResult = Result.Ok(42);
      const objectResult = Result.Ok({ key: "value" });
      const nullResult = Result.Ok(null);

      expect(numberResult.unwrap()).toBe(42);
      expect(objectResult.unwrap()).toEqual({ key: "value" });
      expect(nullResult.unwrap()).toBe(null);
    });

    test("unwrapOrElse should return the value", () => {
      const result = Result.Ok("value");
      expect(result.unwrapOrElse("default")).toBe("value");
    });

    test("match should execute Ok function", () => {
      const result = Result.Ok(10);
      const matched = result.match({
        Ok: (value) => value * 2,
        Err: () => 0,
      });
      expect(matched).toBe(20);
    });
  });

  describe("Err", () => {
    test("should create an Err result with error", () => {
      const result = Result.Err("error message");
      expect(result.isOk()).toBe(false);
      expect(result.isErr()).toBe(true);
    });

    test("unwrap should exit process for Err result", () => {
      const result = Result.Err("error message");

      try {
        result.unwrap();
        fail("Should have thrown");
      } catch (err) {
        expect(err.message).toBe('process.exit called with "1"');
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalled();
    });

    test("unwrapOrElse should return else value", () => {
      const result = Result.Err<string>("error");
      expect(result.unwrapOrElse("default")).toBe("default");
    });

    test("unwrapOrElse should return null if provided", () => {
      const result = Result.Err<string>("error");
      expect(result.unwrapOrElse(null)).toBe(null);
    });

    test("match should execute Err function", () => {
      const result = Result.Err<string>("failed");
      const matched = result.match({
        Ok: () => "success",
        Err: (error) => `Error: ${error.message}`,
      });
      expect(matched).toBe("Error: failed");
    });
  });

  describe("Type guards", () => {
    test("isOk should correctly identify Ok results", () => {
      const okResult = Result.Ok("value");
      const errResult = Result.Err("error");

      expect(okResult.isOk()).toBe(true);
      expect(errResult.isOk()).toBe(false);
    });

    test("isErr should correctly identify Err results", () => {
      const okResult = Result.Ok("value");
      const errResult = Result.Err("error");

      expect(okResult.isErr()).toBe(false);
      expect(errResult.isErr()).toBe(true);
    });
  });

  describe("wrap", () => {
    test("should wrap successful function execution in Ok", () => {
      const fn = (a: number, b: number) => a + b;
      const wrapped = Result.wrap(fn);

      const result = wrapped(2, 3);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(5);
    });

    test("should wrap throwing function in Err", () => {
      const fn = (): string => {
        throw new Error("Function failed");
      };
      const wrapped = Result.wrap(fn);

      const result = wrapped();
      expect(result.isErr()).toBe(true);

      // Verify the error is caught
      const matched = result.match({
        Ok: (v) => v,
        Err: (e) => e.message,
      });
      expect(matched).toBe("Error: Function failed");
    });

    test("should preserve function arguments", () => {
      const fn = (name: string, age: number) => `${name} is ${age} years old`;
      const wrapped = Result.wrap(fn);

      const result = wrapped("John", 30);
      expect(result.unwrap()).toBe("John is 30 years old");
    });
  });
});
