import { useState, useEffect } from 'react';
import { apiGet, apiUrl } from '../lib/api';
import {
  PageIntro,
  PageShell,
  buttonClass,
  inputClass,
  labelClass,
} from '../components/Editorial';

const Reviews = () => {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [formStatus, setFormStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadReviews = () =>
    apiGet('/api/reviews')
      .then((data) => {
        setReviews(Array.isArray(data) ? data : []);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Failed to fetch reviews', error);
        setStatus('error');
      });

  useEffect(() => {
    loadReviews();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormStatus('Submitting review…');

    const formData = new FormData(event.target);
    const newReview = {
      name: formData.get('name'),
      role: formData.get('role'),
      rating: parseInt(formData.get('rating'), 10),
      text: formData.get('message'),
    };

    try {
      const response = await fetch(apiUrl('/api/reviews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReview),
      });

      if (response.ok) {
        setFormStatus('Thank you. Your review is now published.');
        event.target.reset();
        loadReviews();
      } else {
        setFormStatus('The review could not be saved. Please try again.');
      }
    } catch (error) {
      console.error('Review submit error:', error);
      setFormStatus('The backend is offline right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <PageIntro
        index="05"
        label="Reviews"
        title="What people say."
        intro="Short notes from clients and collaborators. If we have worked together, you can add yours below."
      />

      <section className="border-b border-[var(--rule)] py-12 md:py-16">
        <div className="grid grid-cols-12 gap-x-8 gap-y-8">
          <div className="col-span-12 md:col-span-4">
            <p className="eyebrow text-[var(--signal)]">Leave a note</p>
            <h2 className="mt-4 font-display text-3xl leading-tight text-[var(--ink)] md:text-4xl">
              Worked together?
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
              A sentence about the collaboration is more useful than a rating. Both are welcome.
            </p>
          </div>

          <div className="col-span-12 md:col-span-8">
            <form onSubmit={handleSubmit} className="border-t border-[var(--rule)]">
              <div className="grid grid-cols-1 gap-6 border-b border-[var(--rule)] py-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="review-name" className={labelClass}>
                    Name
                  </label>
                  <input
                    id="review-name"
                    type="text"
                    name="name"
                    required
                    placeholder="Your name"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="review-role" className={labelClass}>
                    Role / company
                  </label>
                  <input
                    id="review-role"
                    type="text"
                    name="role"
                    required
                    placeholder="Product lead, Acme"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="review-rating" className={labelClass}>
                    Rating
                  </label>
                  <select id="review-rating" name="rating" required className={inputClass}>
                    <option value="5">5 / 5 — Excellent</option>
                    <option value="4">4 / 5 — Good</option>
                    <option value="3">3 / 5 — Fair</option>
                    <option value="2">2 / 5 — Poor</option>
                    <option value="1">1 / 5 — Bad</option>
                  </select>
                </div>
              </div>

              <div className="border-b border-[var(--rule)] py-6">
                <label htmlFor="review-message" className={labelClass}>
                  Review
                </label>
                <textarea
                  id="review-message"
                  name="message"
                  required
                  rows="4"
                  placeholder="What was it like to work together?"
                  className={`${inputClass} resize-y`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <button type="submit" disabled={isSubmitting} className={buttonClass}>
                  {isSubmitting ? 'Submitting…' : 'Publish review ↗'}
                </button>
                <p className="text-sm text-[var(--ink-soft)]" role="status">
                  {formStatus}
                </p>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        {status === 'loading' && (
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Loading reviews…
          </p>
        )}

        {status === 'error' && (
          <p className="text-sm text-[var(--ink-soft)]">Reviews could not load right now.</p>
        )}

        {status === 'ready' && reviews.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]">No reviews yet. Be the first to leave one.</p>
        )}

        {status === 'ready' && reviews.length > 0 && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
            {reviews.map((review, index) => (
              <blockquote
                key={review._id || index}
                className="border-t border-[var(--rule)] pt-5"
              >
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--signal)]">
                  {review.rating} / 5
                </p>

                <p className="mt-4 font-display text-2xl leading-snug text-[var(--ink)]">
                  “{review.text}”
                </p>

                {review.adminReply && (
                  <div className="mt-5 border-l border-[var(--signal)] pl-4">
                    <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Reply from Shivam
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">
                      {review.adminReply}
                    </p>
                  </div>
                )}

                <footer className="mt-5 flex items-baseline justify-between gap-4 border-t border-[var(--rule)] pt-3">
                  <span className="text-sm text-[var(--ink)]">{review.name}</span>
                  <span className="text-right font-mono-ui text-[9px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                    {review.role}
                  </span>
                </footer>
              </blockquote>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Reviews;
