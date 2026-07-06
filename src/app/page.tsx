import styles from "./styles/Home.module.css"

export const metadata = {
  title: "Home",
  description: "Vibe - A personal Web Lab for apps, experiments and demos.",
}

export default function HomePage() {
  return (
    <div className={styles.hero}>
      {/* Large title with accent dot */}
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>Vibe</h1>
      </div>

      {/* Tagline */}
      <p className={styles.tagline}>Personal Web Lab</p>

      {/* Category tags */}
      <div className={styles.categories}>
        <span className={`${styles.catTag} ${styles["catTag--accent"]}`}>Apps</span>
        <span className={styles.catTag}>Blog</span>
        <span className={styles.catTag}>Experiments</span>
        <span className={styles.catTag}>Tools</span>
        <span className={styles.catTag}>Games</span>
        <span className={styles.catTag}>AI</span>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Original content */}
      <section className={`${styles.description} space-y-5 text-base leading-relaxed text-secondary`}>
        <p>
          Vibe is a personal Web Lab — not just a blog, but a container for
          various web applications, tools, games, experiments, and interactive demos.
        </p>
      </section>
    </div>
  )
}
