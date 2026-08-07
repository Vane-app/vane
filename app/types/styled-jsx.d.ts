import "react";

/**
 * `<style jsx>` — declared here rather than inherited.
 *
 * The attribute is typed by the copy of styled-jsx that Next bundles, which resolves
 * fine when the app is installed on its own. Building the whole workspace hoists the
 * packages differently, the reference stops resolving, and every `<style jsx>` block in
 * the app becomes a type error — a build that fails only in deployment and passes on
 * the machine you would debug it on.
 *
 * Declaring the two attributes we actually use costs nothing and does not care where
 * the package ends up.
 */
declare module "react" {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
